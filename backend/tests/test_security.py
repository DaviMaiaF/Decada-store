"""Testes de senha e token. Não tocam no banco."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import get_settings
from app.services.security import (
    InvalidTokenError,
    create_access_token,
    hash_password,
    read_access_token,
    verify_password,
)

SENHA = "uma-senha-qualquer"


# --------------------------------------------------------------------------
# senha
# --------------------------------------------------------------------------

def test_o_hash_nao_contem_a_senha():
    hash_gerado = hash_password(SENHA)

    assert SENHA not in hash_gerado
    assert hash_gerado.startswith("$2b$")


def test_a_senha_certa_confere():
    assert verify_password(SENHA, hash_password(SENHA)) is True


def test_a_senha_errada_nao_confere():
    assert verify_password("outra-senha", hash_password(SENHA)) is False


def test_dois_hashes_da_mesma_senha_sao_diferentes():
    # Sal próprio por hash: sem isso, senhas iguais teriam hashes iguais e um
    # vazamento do banco revelaria quem usa a mesma senha de quem.
    assert hash_password(SENHA) != hash_password(SENHA)


def test_hash_corrompido_apenas_nega_o_acesso():
    # Não levanta: quem chama trata hash quebrado e senha errada do mesmo jeito.
    assert verify_password(SENHA, "isto-nao-e-um-hash") is False


def test_senha_com_acento_funciona():
    senha = "pão-de-açúcar-2026"
    assert verify_password(senha, hash_password(senha)) is True


# --------------------------------------------------------------------------
# token
# --------------------------------------------------------------------------

def test_o_token_devolve_o_usuario_que_o_gerou():
    user_id = uuid.uuid4()

    assert read_access_token(create_access_token(user_id)) == user_id


def test_token_expirado_e_recusado():
    velho = datetime.now(timezone.utc) - timedelta(
        minutes=get_settings().access_token_expire_minutes + 1
    )
    token = create_access_token(uuid.uuid4(), issued_at=velho)

    with pytest.raises(InvalidTokenError):
        read_access_token(token)


def test_token_adulterado_e_recusado():
    token = create_access_token(uuid.uuid4())

    with pytest.raises(InvalidTokenError):
        read_access_token(token[:-2] + "xy")


def test_texto_qualquer_nao_e_token():
    with pytest.raises(InvalidTokenError):
        read_access_token("nem-de-longe-um-token")


def test_token_assinado_com_outra_chave_e_recusado():
    import jwt

    forjado = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        "chave-do-atacante",
        algorithm="HS256",
    )

    with pytest.raises(InvalidTokenError):
        read_access_token(forjado)
