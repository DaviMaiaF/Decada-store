"""Testes de cadastro, login e exclusão de dados.

A exclusão é o teste mais importante do arquivo: é o que prova que a promessa
de LGPD do projeto — apagar dado pessoal sob demanda, preservando o preço
anonimizado — não é só texto no README.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import Market, MealPlan, PantryItem, PriceRecord, Product, ShoppingList, User
from app.models.enums import MeasurementUnit, PriceOrigin
from app.services.security import create_access_token
from tests.helpers import auth_headers, plano_confirmado

pytestmark = pytest.mark.db

SENHA = "senha-bem-boa-2026"


def _cadastrar(client, email: str = "nova@example.com", senha: str = SENHA) -> str:
    resposta = client.post(
        "/auth/register", json={"email": email, "password": senha, "full_name": "Marina"}
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------
# cadastro
# --------------------------------------------------------------------------

def test_cadastro_devolve_token_utilizavel(client):
    token = _cadastrar(client)

    resposta = client.get("/auth/me", headers=_auth(token))

    assert resposta.status_code == 200
    assert resposta.json()["email"] == "nova@example.com"


def test_a_senha_nunca_volta_na_resposta(client):
    token = _cadastrar(client)

    corpo = client.get("/auth/me", headers=_auth(token)).json()

    assert "password" not in corpo
    assert "password_hash" not in corpo


def test_a_senha_nao_e_guardada_em_texto(client, db_session):
    _cadastrar(client)

    guardado = db_session.scalars(
        select(User).where(User.email == "nova@example.com")
    ).one()

    assert guardado.password_hash != SENHA
    assert SENHA not in guardado.password_hash


def test_email_repetido_e_recusado(client):
    _cadastrar(client)

    resposta = client.post(
        "/auth/register", json={"email": "nova@example.com", "password": SENHA}
    )

    assert resposta.status_code == 409


def test_email_nao_diferencia_maiuscula(client):
    _cadastrar(client, email="Marina@Example.Com")

    resposta = client.post(
        "/auth/register", json={"email": "marina@example.com", "password": SENHA}
    )

    assert resposta.status_code == 409


def test_senha_curta_demais_e_recusada(client):
    resposta = client.post(
        "/auth/register", json={"email": "curta@example.com", "password": "1234"}
    )

    assert resposta.status_code == 422


def test_email_invalido_e_recusado(client):
    resposta = client.post(
        "/auth/register", json={"email": "nao-e-email", "password": SENHA}
    )

    assert resposta.status_code == 422


# --------------------------------------------------------------------------
# login
# --------------------------------------------------------------------------

def test_login_com_a_senha_certa_devolve_token(client):
    _cadastrar(client)

    resposta = client.post(
        "/auth/login", json={"email": "nova@example.com", "password": SENHA}
    )

    assert resposta.status_code == 200
    assert client.get("/auth/me", headers=_auth(resposta.json()["access_token"])).status_code == 200


def test_senha_errada_e_email_inexistente_respondem_igual(client):
    _cadastrar(client)

    senha_errada = client.post(
        "/auth/login", json={"email": "nova@example.com", "password": "outra-coisa"}
    )
    email_inexistente = client.post(
        "/auth/login", json={"email": "ninguem@example.com", "password": SENHA}
    )

    # Respostas idênticas: diferenciar entregaria quem tem conta, e ter conta
    # aqui significa ter um plano alimentar guardado.
    assert senha_errada.status_code == email_inexistente.status_code == 401
    assert senha_errada.json() == email_inexistente.json()


def test_token_expirado_nao_entra(client, db_session):
    _cadastrar(client)
    usuario = db_session.scalars(select(User).where(User.email == "nova@example.com")).one()
    velho = datetime.now(timezone.utc) - timedelta(days=365)

    resposta = client.get(
        "/auth/me", headers=_auth(create_access_token(usuario.id, issued_at=velho))
    )

    assert resposta.status_code == 401


# --------------------------------------------------------------------------
# exclusão sob demanda (LGPD)
# --------------------------------------------------------------------------

@pytest.fixture
def marina_com_dados(client, marina, db_session):
    """Marina com plano, lista de compras, despensa e um preço contribuído."""
    plano_confirmado(client, marina, db_session)
    client.post("/pantry", headers=auth_headers(marina), json={"raw_description": "aveia"})

    plano = db_session.scalars(select(MealPlan).where(MealPlan.user_id == marina.id)).one()
    client.post(
        f"/meal-plans/{plano.id}/shopping-lists",
        headers=auth_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    )

    # Um preço enviado por ela, como viria de uma NFC-e escaneada.
    produto = db_session.scalars(select(Product).limit(1)).one()
    mercado = db_session.scalars(select(Market).limit(1)).one()
    db_session.add(
        PriceRecord(
            product_id=produto.id,
            market_id=mercado.id,
            user_id=marina.id,
            unit_price=Decimal("12.90"),
            unit=MeasurementUnit.QUILOGRAMA,
            price_per_base_unit=Decimal("12.9000"),
            collected_at=datetime.now(timezone.utc),
            origin=PriceOrigin.NFCE,
            state_code="DF",
            city="Brasília",
        )
    )
    db_session.commit()
    return marina


def test_a_exclusao_leva_embora_os_dados_pessoais(client, marina_com_dados, db_session):
    resposta = client.delete("/auth/me", headers=auth_headers(marina_com_dados))

    assert resposta.status_code == 200
    assert db_session.scalars(select(User).where(User.id == marina_com_dados.id)).first() is None
    assert db_session.scalars(select(MealPlan)).all() == []
    assert db_session.scalars(select(PantryItem)).all() == []
    assert db_session.scalars(select(ShoppingList)).all() == []


def test_o_preco_sobrevive_anonimizado(client, marina_com_dados, db_session):
    contribuido = db_session.scalars(
        select(PriceRecord).where(PriceRecord.origin == PriceOrigin.NFCE)
    ).one()
    assert contribuido.user_id == marina_com_dados.id

    client.delete("/auth/me", headers=auth_headers(marina_com_dados))
    db_session.expire_all()

    sobrevivente = db_session.scalars(
        select(PriceRecord).where(PriceRecord.origin == PriceOrigin.NFCE)
    ).one()
    # O preço é informação sobre o mercado, não sobre quem passou no caixa.
    assert sobrevivente.user_id is None
    assert sobrevivente.unit_price == Decimal("12.90")


def test_o_comprovante_diz_o_que_foi_apagado(client, marina_com_dados):
    corpo = client.delete("/auth/me", headers=auth_headers(marina_com_dados)).json()

    assert corpo["meal_plans_deleted"] == 1
    assert corpo["pantry_items_deleted"] == 1
    assert corpo["shopping_lists_deleted"] == 1
    assert corpo["price_records_anonymized"] == 1
    assert corpo["deleted_at"]


def test_o_token_para_de_funcionar_depois_da_exclusao(client, marina_com_dados):
    cabecalho = auth_headers(marina_com_dados)

    assert client.delete("/auth/me", headers=cabecalho).status_code == 200
    # Mesmo token, e agora ele não vale mais: get_current_user não acha o dono.
    assert client.get("/auth/me", headers=cabecalho).status_code == 401
    assert client.get("/pantry", headers=cabecalho).status_code == 401


def test_a_exclusao_nao_atinge_outras_pessoas(client, marina_com_dados, db_session):
    from tests.conftest import novo_usuario

    outra = novo_usuario("outra@example.com")
    db_session.add(outra)
    db_session.commit()
    client.post("/pantry", headers=auth_headers(outra), json={"raw_description": "arroz"})

    client.delete("/auth/me", headers=auth_headers(marina_com_dados))

    assert db_session.scalars(select(User).where(User.id == outra.id)).first() is not None
    assert len(db_session.scalars(select(PantryItem)).all()) == 1


def test_o_catalogo_nao_e_afetado_pela_exclusao(client, marina_com_dados, db_session):
    from sqlalchemy import func

    client.delete("/auth/me", headers=auth_headers(marina_com_dados))

    # Produtos e mercados são bem coletivo: não pertencem a ninguém.
    assert db_session.scalar(select(func.count()).select_from(Product)) == 120
    assert db_session.scalar(select(func.count()).select_from(Market)) == 3


def test_nao_da_para_excluir_sem_estar_autenticado(client):
    assert client.delete("/auth/me").status_code == 401
