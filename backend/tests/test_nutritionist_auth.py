"""Testes da conta de nutricionista: cadastro, login e separação de papéis.

O que mais importa aqui é a separação. Uma conta de nutricionista não pode
enxergar rota de dado de saúde do paciente, e cada porta de login só abre para
o papel dela — sem dizer, para quem bate na porta errada, que a conta existe.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import _require_role
from app.models import User, UserRole
from tests.conftest import SENHA_DE_TESTE, novo_usuario
from tests.helpers import auth_headers

pytestmark = pytest.mark.db

SENHA = "senha-bem-boa-2026"

CADASTRO = {
    "email": "camila.nova@example.com",
    "password": SENHA,
    "full_name": "Camila Fernandes",
    "crn": "CRN-3 48291",
}


def _cadastrar_nutricionista(client, **campos) -> dict:
    resposta = client.post("/auth/nutricionista/register", json={**CADASTRO, **campos})
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------
# cadastro
# --------------------------------------------------------------------------

def test_cadastro_de_nutricionista_devolve_o_papel(client):
    corpo = _cadastrar_nutricionista(client)

    assert corpo["role"] == "nutricionista"

    conta = client.get("/auth/me", headers=_auth(corpo["access_token"])).json()
    assert conta["role"] == "nutricionista"
    assert conta["crn"] == "CRN-3 48291"
    assert conta["full_name"] == "Camila Fernandes"


def test_cadastro_de_paciente_continua_sendo_paciente(client):
    resposta = client.post("/auth/register", json={"email": "p@example.com", "password": SENHA})

    assert resposta.json()["role"] == "paciente"
    conta = client.get("/auth/me", headers=_auth(resposta.json()["access_token"])).json()
    assert conta["role"] == "paciente"
    assert conta["crn"] is None


def test_o_cadastro_de_paciente_ignora_papel_mandado_no_corpo(client, db_session):
    # Ninguém vira nutricionista pela porta do paciente mandando um campo a mais.
    client.post(
        "/auth/register",
        json={"email": "esperta@example.com", "password": SENHA, "role": "nutricionista"},
    )

    conta = db_session.scalars(select(User).where(User.email == "esperta@example.com")).one()
    assert conta.role == UserRole.PACIENTE


@pytest.mark.parametrize("campo", ["crn", "full_name"])
def test_nutricionista_sem_crn_ou_nome_e_recusada(client, campo):
    sem_campo = {k: v for k, v in CADASTRO.items() if k != campo}

    resposta = client.post("/auth/nutricionista/register", json=sem_campo)

    assert resposta.status_code == 422


@pytest.mark.parametrize("campo", ["crn", "full_name"])
def test_crn_ou_nome_so_com_espaco_e_recusado(client, campo):
    resposta = client.post("/auth/nutricionista/register", json={**CADASTRO, campo: "   "})

    assert resposta.status_code == 422


def test_crn_e_guardado_sem_espaco_em_volta(client):
    corpo = _cadastrar_nutricionista(client, crn="  CRN-1 12345 ")

    conta = client.get("/auth/me", headers=_auth(corpo["access_token"])).json()
    assert conta["crn"] == "CRN-1 12345"


def test_email_de_paciente_nao_vira_conta_de_nutricionista(client, marina):
    resposta = client.post(
        "/auth/nutricionista/register", json={**CADASTRO, "email": "marina@example.com"}
    )

    assert resposta.status_code == 409


def test_o_banco_recusa_nutricionista_sem_crn(db_session):
    # A regra vale mesmo para quem escrever direto no banco, sem passar pela API.
    db_session.add(novo_usuario("sem.crn@example.com", role=UserRole.NUTRICIONISTA))

    with pytest.raises(IntegrityError):
        db_session.flush()


# --------------------------------------------------------------------------
# login: uma porta por papel
# --------------------------------------------------------------------------

def test_nutricionista_entra_pela_porta_dela(client, camila):
    resposta = client.post(
        "/auth/nutricionista/login",
        json={"email": "camila@example.com", "password": SENHA_DE_TESTE},
    )

    assert resposta.status_code == 200
    assert resposta.json()["role"] == "nutricionista"


def test_paciente_na_porta_da_nutricionista_parece_senha_errada(client, marina):
    porta_errada = client.post(
        "/auth/nutricionista/login",
        json={"email": "marina@example.com", "password": SENHA_DE_TESTE},
    )
    email_inexistente = client.post(
        "/auth/nutricionista/login",
        json={"email": "ninguem@example.com", "password": SENHA_DE_TESTE},
    )

    # Dizer "essa conta é de paciente" confirmaria que a pessoa tem um plano
    # alimentar guardado aqui (decisão 10).
    assert porta_errada.status_code == email_inexistente.status_code == 401
    assert porta_errada.json() == email_inexistente.json()


def test_nutricionista_na_porta_do_paciente_parece_senha_errada(client, camila):
    porta_errada = client.post(
        "/auth/login", json={"email": "camila@example.com", "password": SENHA_DE_TESTE}
    )
    email_inexistente = client.post(
        "/auth/login", json={"email": "ninguem@example.com", "password": SENHA_DE_TESTE}
    )

    assert porta_errada.status_code == email_inexistente.status_code == 401
    assert porta_errada.json() == email_inexistente.json()


def test_senha_errada_de_nutricionista_nao_entra(client, camila):
    resposta = client.post(
        "/auth/nutricionista/login",
        json={"email": "camila@example.com", "password": "outra-coisa"},
    )

    assert resposta.status_code == 401


# --------------------------------------------------------------------------
# separação das rotas
# --------------------------------------------------------------------------

@pytest.mark.parametrize("rota", ["/meal-plans", "/pantry"])
def test_nutricionista_nao_enxerga_rotas_do_paciente(client, camila, rota):
    resposta = client.get(rota, headers=auth_headers(camila))

    # 404, como recurso de outra pessoa: a rota não existe para esse papel.
    assert resposta.status_code == 404


@pytest.mark.parametrize("rota", ["/meal-plans", "/pantry"])
def test_paciente_continua_enxergando_as_proprias_rotas(client, marina, rota):
    assert client.get(rota, headers=auth_headers(marina)).status_code == 200


def test_nutricionista_pode_buscar_no_catalogo(client, camila):
    # Vai precisar disso para escolher os ingredientes das receitas.
    resposta = client.get("/products/search", params={"q": "frango"}, headers=auth_headers(camila))

    assert resposta.status_code == 200


def test_rota_de_nutricionista_recusa_paciente_com_404(marina, camila):
    so_nutricionista = _require_role(UserRole.NUTRICIONISTA)

    assert so_nutricionista(camila) is camila
    with pytest.raises(HTTPException) as recusa:
        so_nutricionista(marina)
    assert recusa.value.status_code == 404


def test_nutricionista_pode_excluir_a_propria_conta(client, camila, db_session):
    resposta = client.delete("/auth/me", headers=auth_headers(camila))

    assert resposta.status_code == 200
    assert db_session.get(User, camila.id) is None
