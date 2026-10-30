"""Configuração: a URL do banco e a exigência de SECRET_KEY própria fora de dev."""

import pytest
from pydantic import ValidationError

from app.core.config import DEV_SECRET_KEY, Settings


@pytest.fixture(autouse=True)
def _sem_database_url(monkeypatch):
    # Isola o teste do ambiente da máquina: só vale o que cada teste define.
    monkeypatch.delenv("DATABASE_URL", raising=False)


def test_sem_database_url_monta_pelas_variaveis_postgres():
    settings = Settings(
        _env_file=None,
        postgres_user="u",
        postgres_password="p",
        postgres_host="h",
        postgres_port=6543,
        postgres_db="d",
    )

    assert settings.database_url == "postgresql+psycopg://u:p@h:6543/d"


def test_database_url_vence_as_variaveis_postgres(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://neon:s@ep.neon.tech/db")

    settings = Settings(_env_file=None, postgres_host="localhost")

    assert settings.database_url == "postgresql+psycopg://neon:s@ep.neon.tech/db"


@pytest.mark.parametrize(
    "url",
    [
        "postgres://u:p@h:5432/d",
        "postgresql://u:p@h:5432/d",
        "postgresql+psycopg://u:p@h:5432/d",
    ],
)
def test_prefixo_vira_driver_psycopg(monkeypatch, url):
    monkeypatch.setenv("DATABASE_URL", url)

    assert Settings(_env_file=None).database_url == "postgresql+psycopg://u:p@h:5432/d"


def test_preserva_parametros_de_ssl(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://u:p@ep.neon.tech/d?sslmode=require&channel_binding=require",
    )

    assert Settings(_env_file=None).database_url == (
        "postgresql+psycopg://u:p@ep.neon.tech/d?sslmode=require&channel_binding=require"
    )


def test_dev_aceita_a_chave_padrao():
    assert Settings(_env_file=None, app_env="dev").secret_key == DEV_SECRET_KEY


@pytest.mark.parametrize("ambiente", ["demo", "prod"])
@pytest.mark.parametrize("chave", [DEV_SECRET_KEY, ""])
def test_fora_de_dev_recusa_chave_padrao_ou_vazia(ambiente, chave):
    # Com a chave versionada no repositório, qualquer um assinaria um token válido.
    with pytest.raises(ValidationError) as erro:
        Settings(_env_file=None, app_env=ambiente, secret_key=chave)

    assert "SECRET_KEY" in str(erro.value)


def test_fora_de_dev_aceita_chave_propria():
    settings = Settings(_env_file=None, app_env="demo", secret_key="x" * 48)

    assert settings.secret_key == "x" * 48
