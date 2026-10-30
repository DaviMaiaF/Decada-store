"""A URL do banco: variável única (Neon, Render) ou montada pelas POSTGRES_*."""

import pytest

from app.core.config import Settings


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
