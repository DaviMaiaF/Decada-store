"""Testes do caminho do plano da nutricionista até o paciente, pelo e-mail.

O que precisa ficar provado:
  - o envio não revela se o e-mail tem conta (decisão 10);
  - o plano só vira dado do paciente com o aceite dele (decisão 5);
  - só a opção principal de cada refeição vai para a compra, e as
    substituições chegam inteiras para ler (decisão 8);
  - a cópia do paciente sobrevive à nutricionista excluir a conta.
"""

import uuid

import pytest
from sqlalchemy import select

from app.models import MealPlan, Prescription, PrescriptionStatus, User
from tests.conftest import novo_usuario
from tests.helpers import auth_headers, plano_da_nutricionista

pytestmark = pytest.mark.db

ROTA = "/nutritionist/prescriptions"
RECEBIDOS = "/prescriptions/received"


def _criar(client, autora: User) -> str:
    resposta = client.post(ROTA, json=plano_da_nutricionista(), headers=auth_headers(autora))
    assert resposta.status_code == 201, resposta.text
    return resposta.json()["id"]


def _enviar(client, autora: User, plano_id: str, email: str):
    return client.post(
        f"{ROTA}/{plano_id}/send", json={"patient_email": email}, headers=auth_headers(autora)
    )


def _recebidos(client, paciente: User) -> list[dict]:
    resposta = client.get(RECEBIDOS, headers=auth_headers(paciente))
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def _aceitar(client, paciente: User, plano_id: str, consentimento: bool = True):
    return client.post(
        f"{RECEBIDOS}/{plano_id}/accept",
        json={"consent_accepted": consentimento},
        headers=auth_headers(paciente),
    )


@pytest.fixture
def enviado(client, camila, marina) -> str:
    plano_id = _criar(client, camila)
    assert _enviar(client, camila, plano_id, "marina@example.com").status_code == 200
    return plano_id


# --------------------------------------------------------------------------
# envio
# --------------------------------------------------------------------------

def test_envio_nao_revela_se_o_email_tem_conta(client, camila, marina):
    com_conta = _enviar(client, camila, _criar(client, camila), "marina@example.com")
    sem_conta = _enviar(client, camila, _criar(client, camila), "ninguem@example.com")

    assert com_conta.status_code == sem_conta.status_code == 200
    assert set(com_conta.json()) == set(sem_conta.json())
    assert com_conta.json()["status"] == sem_conta.json()["status"] == "enviada"


def test_email_invalido_e_recusado(client, camila):
    assert _enviar(client, camila, _criar(client, camila), "não é e-mail").status_code == 422


def test_o_paciente_ve_o_plano_enviado_ao_email_dele(client, camila, marina):
    plano_id = _criar(client, camila)
    _enviar(client, camila, plano_id, "Marina@Example.COM")

    recebidos = _recebidos(client, marina)

    assert [r["id"] for r in recebidos] == [plano_id]
    assert recebidos[0]["author"] == {"full_name": "Camila Fernandes", "crn": "CRN-3 48291"}
    cafe = recebidos[0]["meals"][0]
    assert [[i["food"] for i in opcao] for opcao in cafe["substitutions"]] == [
        ["Tapioca", "Banana prata"]
    ]


def test_quem_cria_a_conta_depois_tambem_ve(client, camila, db_session):
    plano_id = _criar(client, camila)
    _enviar(client, camila, plano_id, "nova@example.com")

    nova = novo_usuario("nova@example.com")
    db_session.add(nova)
    db_session.commit()

    assert [r["id"] for r in _recebidos(client, nova)] == [plano_id]


def test_outro_paciente_nao_ve_nem_aceita(client, enviado, outra_pessoa, db_session):
    assert _recebidos(client, outra_pessoa) == []
    assert _aceitar(client, outra_pessoa, enviado).status_code == 404
    assert db_session.scalars(select(MealPlan)).first() is None


def test_rascunho_nao_aparece_para_ninguem(client, camila, marina):
    _criar(client, camila)

    assert _recebidos(client, marina) == []


def test_editar_depois_de_enviar_muda_o_que_o_paciente_le(client, camila, marina, enviado):
    client.put(
        f"{ROTA}/{enviado}",
        json=plano_da_nutricionista(title="Plano revisto"),
        headers=auth_headers(camila),
    )

    assert _recebidos(client, marina)[0]["title"] == "Plano revisto"


def test_nutricionista_nao_chega_nos_planos_recebidos(client, camila):
    assert client.get(RECEBIDOS, headers=auth_headers(camila)).status_code == 404


# --------------------------------------------------------------------------
# aceite
# --------------------------------------------------------------------------

def test_sem_consentimento_nada_e_gravado(client, marina, enviado, db_session):
    resposta = _aceitar(client, marina, enviado, consentimento=False)

    assert resposta.status_code == 422
    assert db_session.scalars(select(MealPlan)).first() is None
    assert db_session.get(Prescription, uuid.UUID(enviado)).status is PrescriptionStatus.ENVIADA


def test_aceitar_vira_plano_do_paciente_so_com_a_opcao_principal(client, marina, enviado):
    resposta = _aceitar(client, marina, enviado)

    assert resposta.status_code == 201, resposta.text
    corpo = resposta.json()
    plano = corpo["meal_plan"]
    # Pão, ovos, arroz e feijão. Tapioca e banana são substituição: não entram.
    assert [i["raw_description"] for i in plano["items"]] == [
        "Pão francês - 50 g - 1 unidade média",
        "Ovos de galinha - 2 unidades",
        "Arroz branco cozido - 150 g - 6 colheres de sopa",
        "Feijão cozido - 50 g - 1 concha pequena",
    ]
    assert corpo["items_created"] == 4
    assert corpo["discarded"] == []
    assert plano["nutritionist_name"] == "Camila Fernandes"
    assert plano["nutritionist_crn"] == "CRN-3 48291"
    assert all(i["status"] in ("pendente", "nao_identificado") for i in plano["items"])


def test_as_substituicoes_chegam_ao_plano_para_ler(client, marina, enviado):
    plano_id = _aceitar(client, marina, enviado).json()["meal_plan"]["id"]

    plano = client.get(f"/meal-plans/{plano_id}", headers=auth_headers(marina)).json()

    prescrito = plano["prescribed_meals"]
    assert prescrito["notes"] == "Beba dois litros de água por dia."
    cafe = prescrito["meals"][0]
    assert cafe["name"] == "Café da manhã"
    assert cafe["notes"] == "Evite açúcar no café."
    assert cafe["substitutions"][0][0]["household_measure"] == "2 colheres de sopa"


def test_o_texto_aceito_fica_guardado_para_auditoria(client, marina, enviado, db_session):
    _aceitar(client, marina, enviado)

    plano = db_session.scalars(select(MealPlan).where(MealPlan.user_id == marina.id)).one()
    assert "Substituição 1" in plano.source_text
    assert plano.consent_at is not None


def test_plano_aceito_some_dos_recebidos_e_trava(client, camila, marina, enviado):
    _aceitar(client, marina, enviado)

    assert _recebidos(client, marina) == []
    assert _aceitar(client, marina, enviado).status_code == 404
    situacao = client.get(f"{ROTA}/{enviado}", headers=auth_headers(camila)).json()
    assert situacao["status"] == "aceita"
    assert (
        client.put(
            f"{ROTA}/{enviado}", json=plano_da_nutricionista(), headers=auth_headers(camila)
        ).status_code
        == 409
    )
    assert _enviar(client, camila, enviado, "outra@example.com").status_code == 409


def test_o_plano_aceito_aparece_na_lista_de_planos(client, marina, enviado):
    _aceitar(client, marina, enviado)

    planos = client.get("/meal-plans", headers=auth_headers(marina)).json()

    assert len(planos) == 1
    assert planos[0]["item_count"] == 4


# --------------------------------------------------------------------------
# recusa e reenvio
# --------------------------------------------------------------------------

def test_recusar_nao_grava_nada(client, camila, marina, enviado, db_session):
    resposta = client.post(f"{RECEBIDOS}/{enviado}/decline", headers=auth_headers(marina))

    assert resposta.status_code == 204
    assert db_session.scalars(select(MealPlan)).first() is None
    assert _recebidos(client, marina) == []
    situacao = client.get(f"{ROTA}/{enviado}", headers=auth_headers(camila)).json()
    assert situacao["status"] == "recusada"


def test_plano_recusado_pode_ser_reenviado(client, camila, marina, enviado):
    client.post(f"{RECEBIDOS}/{enviado}/decline", headers=auth_headers(marina))

    _enviar(client, camila, enviado, "marina@example.com")

    assert [r["id"] for r in _recebidos(client, marina)] == [enviado]


# --------------------------------------------------------------------------
# exclusão de conta (LGPD)
# --------------------------------------------------------------------------

def test_o_plano_aceito_sobrevive_a_nutricionista_sair(client, camila, marina, enviado):
    plano_id = _aceitar(client, marina, enviado).json()["meal_plan"]["id"]

    client.delete("/auth/me", headers=auth_headers(camila))

    plano = client.get(f"/meal-plans/{plano_id}", headers=auth_headers(marina))
    assert plano.status_code == 200
    assert len(plano.json()["items"]) == 4
    assert plano.json()["prescribed_meals"]["meals"][0]["substitutions"]


def test_plano_pendente_some_quando_a_nutricionista_sai(client, camila, marina, enviado):
    client.delete("/auth/me", headers=auth_headers(camila))

    assert _recebidos(client, marina) == []


def test_paciente_sair_nao_apaga_o_documento_da_nutricionista(client, camila, marina, enviado):
    _aceitar(client, marina, enviado)

    comprovante = client.delete("/auth/me", headers=auth_headers(marina)).json()

    assert comprovante["meal_plans_deleted"] == 1
    assert client.get(f"{ROTA}/{enviado}", headers=auth_headers(camila)).status_code == 200
