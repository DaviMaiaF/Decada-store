"""Testes da conta de super usuário: criação, porta de login e suspensão.

Como nas outras contas, a separação é o que mais importa: este papel não tem
cadastro público, não enxerga dado de saúde e não se revela a quem bate na porta.
"""

from datetime import datetime, timezone

import jwt
import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.models import User, UserRole
from app.services.security import verify_password
from app.services.superuser import SuperuserError, create_superuser
from tests.conftest import SENHA_DE_TESTE, novo_usuario
from tests.helpers import auth_headers

pytestmark = pytest.mark.db

SENHA_FORTE = "senha-bem-longa-2026"


@pytest.fixture
def superusuario(db_session) -> User:
    pessoa = novo_usuario("admin@example.com", role=UserRole.ADMIN)
    db_session.add(pessoa)
    db_session.commit()
    return pessoa


# --------------------------------------------------------------------------
# criação
# --------------------------------------------------------------------------

def test_cria_o_super_usuario_com_hash_e_email_em_minusculas(db_session):
    conta = create_superuser(db_session, "Admin@Example.com", SENHA_FORTE, "Pessoa")

    assert conta.role == UserRole.ADMIN
    assert conta.email == "admin@example.com"
    assert conta.password_hash != SENHA_FORTE
    assert verify_password(SENHA_FORTE, conta.password_hash)


def test_nao_promove_conta_que_ja_existe(db_session, marina):
    with pytest.raises(SuperuserError, match="já existe"):
        create_superuser(db_session, marina.email, SENHA_FORTE)

    db_session.expire_all()
    assert db_session.get(User, marina.id).role == UserRole.PACIENTE


@pytest.mark.parametrize(
    ("email", "senha", "motivo"),
    [
        ("nao-e-email", SENHA_FORTE, "e-mail inválido"),
        ("a@example.com", "curta", "ao menos 12"),
        ("a@example.com", "x" * 73, "limite"),
    ],
)
def test_recusa_entrada_invalida_sem_gravar(db_session, email, senha, motivo):
    with pytest.raises(SuperuserError, match=motivo):
        create_superuser(db_session, email, senha)

    assert db_session.scalars(select(User).where(User.role == UserRole.ADMIN)).all() == []


def test_nao_existe_cadastro_publico_de_super_usuario(client):
    resposta = client.post(
        "/auth/admin/register", json={"email": "a@example.com", "password": SENHA_FORTE}
    )

    assert resposta.status_code in (404, 405)


def test_cadastro_de_paciente_ignora_papel_de_super_usuario(client, db_session):
    client.post(
        "/auth/register",
        json={"email": "esperta@example.com", "password": SENHA_FORTE, "role": "admin"},
    )

    conta = db_session.scalars(select(User).where(User.email == "esperta@example.com")).one()
    assert conta.role == UserRole.PACIENTE


# --------------------------------------------------------------------------
# login
# --------------------------------------------------------------------------

def test_super_usuario_entra_pela_porta_dele(client, superusuario):
    resposta = client.post(
        "/auth/admin/login", json={"email": superusuario.email, "password": SENHA_DE_TESTE}
    )

    assert resposta.status_code == 200
    assert resposta.json()["role"] == "admin"


def test_token_do_super_usuario_dura_pouco(client, superusuario):
    token = client.post(
        "/auth/admin/login", json={"email": superusuario.email, "password": SENHA_DE_TESTE}
    ).json()["access_token"]

    dados = jwt.decode(token, options={"verify_signature": False})
    duracao = (dados["exp"] - dados["iat"]) / 60

    assert duracao == get_settings().admin_token_expire_minutes
    assert duracao < get_settings().access_token_expire_minutes


def test_paciente_na_porta_do_super_usuario_parece_senha_errada(client, marina):
    porta_errada = client.post(
        "/auth/admin/login", json={"email": marina.email, "password": SENHA_DE_TESTE}
    )
    email_inexistente = client.post(
        "/auth/admin/login", json={"email": "ninguem@example.com", "password": SENHA_DE_TESTE}
    )

    assert porta_errada.status_code == email_inexistente.status_code == 401
    assert porta_errada.json() == email_inexistente.json()


@pytest.mark.parametrize("porta", ["/auth/login", "/auth/nutritionist/login"])
def test_super_usuario_nas_outras_portas_parece_senha_errada(client, superusuario, porta):
    resposta = client.post(porta, json={"email": superusuario.email, "password": SENHA_DE_TESTE})

    assert resposta.status_code == 401


@pytest.mark.parametrize("rota", ["/meal-plans", "/pantry"])
def test_super_usuario_nao_enxerga_rotas_de_dado_de_saude(client, superusuario, rota):
    # Decisão 15: ele cuida do sistema, não lê o plano de ninguém.
    assert client.get(rota, headers=auth_headers(superusuario)).status_code == 404


# --------------------------------------------------------------------------
# conta suspensa
# --------------------------------------------------------------------------

def test_conta_suspensa_nao_entra_e_parece_senha_errada(client, marina, db_session):
    marina.suspended_at = datetime.now(timezone.utc)
    db_session.commit()

    suspensa = client.post(
        "/auth/login", json={"email": marina.email, "password": SENHA_DE_TESTE}
    )
    email_inexistente = client.post(
        "/auth/login", json={"email": "ninguem@example.com", "password": SENHA_DE_TESTE}
    )

    assert suspensa.status_code == email_inexistente.status_code == 401
    assert suspensa.json() == email_inexistente.json()


def test_token_de_conta_suspensa_para_de_funcionar(client, marina, db_session):
    cabecalho = auth_headers(marina)
    assert client.get("/auth/me", headers=cabecalho).status_code == 200

    marina.suspended_at = datetime.now(timezone.utc)
    db_session.commit()

    assert client.get("/auth/me", headers=cabecalho).status_code == 401
