"""Testes do painel do super usuário: quem entra, o que vê e o que pode fazer.

Dois compromissos valem mais que os outros. Nenhuma resposta traz conteúdo de saúde
(decisão 15), e o histórico não lembra de quem foi excluído (decisão 9).
"""

import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import (
    AdminAction,
    AdminActionType,
    BaseUnit,
    Market,
    MealPlan,
    MeasurementUnit,
    PriceOrigin,
    PriceRecord,
    Product,
    User,
    UserRole,
)
from app.schemas.admin import AdminAccountOut, AdminActionOut
from app.services.admin import dashboard_metrics, list_accounts
from tests.conftest import novo_usuario
from tests.helpers import auth_headers, importar_plano

pytestmark = pytest.mark.db

API = "/admin/api"


@pytest.fixture
def admin(db_session) -> User:
    pessoa = novo_usuario("admin@example.com", role=UserRole.ADMIN)
    db_session.add(pessoa)
    db_session.commit()
    return pessoa


@pytest.fixture
def outro_admin(db_session) -> User:
    pessoa = novo_usuario("outro.admin@example.com", role=UserRole.ADMIN)
    db_session.add(pessoa)
    db_session.commit()
    return pessoa


# --------------------------------------------------------------------------
# quem entra
# --------------------------------------------------------------------------

ROTAS = [
    ("get", "/dashboard"),
    ("get", "/accounts"),
    ("get", "/actions"),
    ("post", f"/accounts/{uuid.uuid4()}/suspend"),
    ("post", f"/accounts/{uuid.uuid4()}/reactivate"),
    ("delete", f"/accounts/{uuid.uuid4()}"),
]


@pytest.mark.parametrize(("metodo", "rota"), ROTAS)
def test_sem_token_responde_401(client, metodo, rota):
    assert getattr(client, metodo)(API + rota).status_code == 401


@pytest.mark.parametrize(("metodo", "rota"), ROTAS)
def test_paciente_e_nutricionista_nao_enxergam_o_painel(client, marina, camila, metodo, rota):
    for pessoa in (marina, camila):
        resposta = getattr(client, metodo)(API + rota, headers=auth_headers(pessoa))
        # 404, e não 403: para esses papéis a rota não existe (decisão 10).
        assert resposta.status_code == 404, pessoa.email


def test_paciente_nao_consegue_suspender_outra_pessoa(client, marina, outra_pessoa, db_session):
    client.post(f"{API}/accounts/{outra_pessoa.id}/suspend", headers=auth_headers(marina))

    db_session.expire_all()
    assert db_session.get(User, outra_pessoa.id).suspended_at is None
    assert db_session.scalars(select(AdminAction)).all() == []


def test_super_usuario_suspenso_perde_o_acesso(client, admin, db_session):
    admin.suspended_at = datetime.now(timezone.utc)
    db_session.commit()

    assert client.get(f"{API}/dashboard", headers=auth_headers(admin)).status_code == 401


# --------------------------------------------------------------------------
# dashboard
# --------------------------------------------------------------------------

def test_dashboard_conta_as_contas_por_papel(client, admin, marina, camila, db_session):
    marina.suspended_at = datetime.now(timezone.utc)
    db_session.commit()

    contas = client.get(f"{API}/dashboard", headers=auth_headers(admin)).json()["accounts"]

    assert contas["by_role"]["admin"] == 1
    assert contas["by_role"]["nutricionista"] == 1
    assert contas["by_role"]["paciente"] >= 1
    assert contas["total"] == sum(contas["by_role"].values())
    assert contas["suspended"] == 1


def test_dashboard_mostra_categoria_zerada_em_vez_de_omitir(client, admin):
    corpo = client.get(f"{API}/dashboard", headers=auth_headers(admin)).json()

    assert corpo["payments"]["by_status"]["aprovado"] == 0
    assert corpo["prices"]["by_origin"]["nfce"] == 0
    assert corpo["prescriptions"]["by_status"]["rascunho"] == 0


def test_cadastros_por_semana_tem_oito_semanas_sem_super_usuario(db_session, banco_vazio):
    agora = datetime(2026, 11, 11, 12, tzinfo=timezone.utc)  # quarta-feira
    db_session.add_all(
        [
            novo_usuario("hoje@example.com", created_at=agora),
            novo_usuario("segunda@example.com", created_at=agora - timedelta(days=2, hours=12)),
            novo_usuario("passada@example.com", created_at=agora - timedelta(days=7)),
            novo_usuario("antiga@example.com", created_at=agora - timedelta(weeks=20)),
            novo_usuario("adm@example.com", role=UserRole.ADMIN, created_at=agora),
        ]
    )
    db_session.commit()

    semanas = dashboard_metrics(db_session, now=agora)["accounts"]["signups_by_week"]

    assert len(semanas) == 8
    assert semanas[-1]["week_start"].isoformat() == "2026-11-09"
    assert semanas[-1]["count"] == 2
    assert semanas[-2]["count"] == 1
    assert sum(semana["count"] for semana in semanas) == 3


def test_preco_com_mais_de_30_dias_conta_como_antigo(db_session, banco_vazio):
    agora = datetime(2026, 11, 11, tzinfo=timezone.utc)
    produto = Product(
        name="Arroz",
        slug="arroz",
        normalized_name="arroz",
        base_unit=BaseUnit.QUILOGRAMA,
        is_fictitious=True,
    )
    mercado = Market(name="Mercado", state_code="DF", city="Brasília")
    db_session.add_all([produto, mercado])
    db_session.flush()

    def preco(dias: float, origem: PriceOrigin, uf: str, cidade: str) -> PriceRecord:
        return PriceRecord(
            product_id=produto.id,
            market_id=mercado.id,
            unit_price=10,
            unit=MeasurementUnit.QUILOGRAMA,
            price_per_base_unit=10,
            collected_at=agora - timedelta(days=dias),
            origin=origem,
            state_code=uf,
            city=cidade,
        )

    db_session.add_all(
        [
            preco(5, PriceOrigin.NFCE, "DF", "Brasília"),
            # 30 dias e meio ainda é recente, como na classificação do app.
            preco(30.5, PriceOrigin.SEED, "DF", "Brasília"),
            preco(31, PriceOrigin.SEED, "DF", "Brasília"),
            preco(90, PriceOrigin.SEED, "GO", "Goiânia"),
        ]
    )
    db_session.commit()

    precos = dashboard_metrics(db_session, now=agora)["prices"]

    assert precos["total"] == 4
    assert precos["stale"] == 2
    assert precos["by_origin"]["nfce"] == 1
    assert precos["by_origin"]["seed"] == 3
    assert precos["by_region"] == [
        {"state_code": "DF", "city": "Brasília", "total": 3, "stale": 1},
        {"state_code": "GO", "city": "Goiânia", "total": 1, "stale": 1},
    ]


# --------------------------------------------------------------------------
# dado de saúde não passa por aqui
# --------------------------------------------------------------------------

def test_nenhuma_resposta_traz_conteudo_do_plano(client, admin, marina, db_session):
    importar_plano(client, marina, ["Almoço", "Tempeh-marcador-secreto 200 g"])
    plano = db_session.scalars(select(MealPlan).where(MealPlan.user_id == marina.id)).one()
    plano.title = "Titulo-marcador-secreto"
    db_session.commit()
    client.post(f"{API}/accounts/{marina.id}/suspend", headers=auth_headers(admin))

    respostas = [
        client.get(f"{API}{rota}", headers=auth_headers(admin)).json()
        for rota in ("/dashboard", "/accounts", "/actions")
    ]

    texto = json.dumps(respostas)
    assert "marcador-secreto" not in texto.lower()
    # A conta aparece, com a contagem: é o que o super usuário precisa saber.
    assert marina.email in texto


def test_conta_listada_nao_tem_campo_de_saude_nem_senha():
    assert set(AdminAccountOut.model_fields) == {
        "id",
        "email",
        "full_name",
        "role",
        "created_at",
        "suspended_at",
        "meal_plans_count",
        "prescriptions_count",
    }


# --------------------------------------------------------------------------
# lista de contas
# --------------------------------------------------------------------------

def test_lista_traz_a_contagem_de_planos(client, admin, marina):
    importar_plano(client, marina)

    corpo = client.get(
        f"{API}/accounts", params={"q": marina.email}, headers=auth_headers(admin)
    ).json()

    assert corpo["total"] == 1
    assert corpo["items"][0]["meal_plans_count"] == 1
    assert corpo["items"][0]["prescriptions_count"] == 0


def test_busca_por_nome_e_por_email_sem_diferenciar_maiusculas(db_session, camila, marina):
    total_nome, por_nome = list_accounts(db_session, search="FERNANDES")
    total_email, por_email = list_accounts(db_session, search="MARINA@")

    assert total_nome == 1 and por_nome[0].email == camila.email
    assert total_email == 1 and por_email[0].email == marina.email


def test_curinga_digitado_na_busca_nao_e_curinga(db_session, marina):
    assert list_accounts(db_session, search="%")[0] == 0
    assert list_accounts(db_session, search="mar_na")[0] == 0


def test_filtra_por_papel(client, admin, marina, camila):
    corpo = client.get(
        f"{API}/accounts", params={"role": "nutricionista"}, headers=auth_headers(admin)
    ).json()

    assert [conta["email"] for conta in corpo["items"]] == [camila.email]


def test_pagina_sem_perder_o_total(client, admin, marina, camila, outra_pessoa):
    corpo = client.get(
        f"{API}/accounts", params={"limit": 1, "offset": 1}, headers=auth_headers(admin)
    ).json()

    assert len(corpo["items"]) == 1
    assert corpo["total"] >= 4


@pytest.mark.parametrize("parametros", [{"limit": 0}, {"limit": 101}, {"offset": -1}])
def test_recusa_paginacao_fora_do_limite(client, admin, parametros):
    resposta = client.get(f"{API}/accounts", params=parametros, headers=auth_headers(admin))

    assert resposta.status_code == 422


# --------------------------------------------------------------------------
# suspender e reativar
# --------------------------------------------------------------------------

def test_suspender_tira_o_acesso_e_nao_apaga_nada(client, admin, marina, db_session):
    importar_plano(client, marina)
    cabecalho = auth_headers(marina)

    resposta = client.post(f"{API}/accounts/{marina.id}/suspend", headers=auth_headers(admin))

    assert resposta.status_code == 200
    assert resposta.json()["suspended_at"] is not None
    assert client.get("/auth/me", headers=cabecalho).status_code == 401
    assert db_session.scalars(select(MealPlan).where(MealPlan.user_id == marina.id)).all() != []


def test_reativar_devolve_o_acesso(client, admin, marina):
    cabecalho = auth_headers(marina)
    client.post(f"{API}/accounts/{marina.id}/suspend", headers=auth_headers(admin))

    resposta = client.post(f"{API}/accounts/{marina.id}/reactivate", headers=auth_headers(admin))

    assert resposta.json()["suspended_at"] is None
    assert client.get("/auth/me", headers=cabecalho).status_code == 200


def test_repetir_a_acao_nao_suja_o_historico(client, admin, marina, db_session):
    for _ in range(2):
        resposta = client.post(f"{API}/accounts/{marina.id}/suspend", headers=auth_headers(admin))
        assert resposta.status_code == 200

    assert len(db_session.scalars(select(AdminAction)).all()) == 1




@pytest.mark.parametrize(
    ("metodo", "rota"),
    [("post", "/suspend"), ("post", "/reactivate"), ("delete", "")],
)
def test_conta_inexistente_responde_404(client, admin, metodo, rota):
    url = f"{API}/accounts/{uuid.uuid4()}{rota}"

    assert getattr(client, metodo)(url, headers=auth_headers(admin)).status_code == 404


@pytest.mark.parametrize(
    ("metodo", "rota"),
    [("post", "/suspend"), ("post", "/reactivate"), ("delete", "")],
)
def test_nao_altera_a_propria_conta_nem_outro_super_usuario(
    client, admin, outro_admin, db_session, metodo, rota
):
    for alvo in (admin, outro_admin):
        url = f"{API}/accounts/{alvo.id}{rota}"
        assert getattr(client, metodo)(url, headers=auth_headers(admin)).status_code == 409

    db_session.expire_all()
    assert db_session.get(User, outro_admin.id).suspended_at is None
    assert db_session.scalars(select(AdminAction)).all() == []


# --------------------------------------------------------------------------
# excluir
# --------------------------------------------------------------------------

def test_excluir_leva_os_dados_e_devolve_o_comprovante(client, admin, marina, db_session):
    importar_plano(client, marina)
    id_da_conta = marina.id

    resposta = client.delete(f"{API}/accounts/{id_da_conta}", headers=auth_headers(admin))

    assert resposta.status_code == 200
    assert resposta.json()["meal_plans_deleted"] == 1
    db_session.expire_all()
    assert db_session.get(User, id_da_conta) is None
    assert db_session.scalars(select(MealPlan).where(MealPlan.user_id == id_da_conta)).all() == []


def test_o_historico_nao_lembra_de_quem_foi_excluido(client, admin, marina, db_session):
    email = marina.email
    id_da_conta = marina.id
    client.post(f"{API}/accounts/{id_da_conta}/suspend", headers=auth_headers(admin))
    antes = client.get(f"{API}/actions", headers=auth_headers(admin)).json()
    assert antes["items"][0]["target_email"] == email

    client.delete(f"{API}/accounts/{id_da_conta}", headers=auth_headers(admin))
    db_session.expire_all()

    depois = client.get(f"{API}/actions", headers=auth_headers(admin))
    assert email not in depois.text
    assert str(id_da_conta) not in depois.text
    acoes = {item["action"]: item for item in depois.json()["items"]}
    assert acoes["conta_excluida"]["target_role"] == "paciente"
    assert acoes["conta_excluida"]["target_email"] is None
    assert acoes["conta_excluida"]["actor_email"] == admin.email
    # A suspensão anterior também perdeu o vínculo.
    assert acoes["conta_suspensa"]["target_email"] is None
    assert all(a.target_id is None for a in db_session.scalars(select(AdminAction)).all())


def test_o_historico_sobrevive_ao_super_usuario_sair(client, admin, marina, db_session):
    client.post(f"{API}/accounts/{marina.id}/suspend", headers=auth_headers(admin))

    client.delete("/auth/me", headers=auth_headers(admin))
    db_session.expire_all()

    acao = db_session.scalars(select(AdminAction)).one()
    assert acao.action == AdminActionType.CONTA_SUSPENSA
    assert acao.actor_id is None


def test_item_do_historico_nao_tem_campo_de_saude():
    assert set(AdminActionOut.model_fields) == {
        "id",
        "action",
        "target_role",
        "created_at",
        "actor_email",
        "target_email",
    }
