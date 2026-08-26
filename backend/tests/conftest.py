"""Fixtures compartilhadas.

Os testes marcados com `db` usam um banco separado (`nutricart_test`) no mesmo
Postgres do docker compose, recriado a cada execução da suíte. As tabelas vêm
de `create_all` e não do Alembic: é mais rápido, e a migração já tem seu
próprio teste de ida e volta feito na etapa 1.
"""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Base

TEST_DATABASE_NAME = "nutricart_test"


@pytest.fixture(scope="session")
def test_engine():
    settings = get_settings()
    admin_url = settings.database_url

    try:
        admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
        with admin_engine.connect() as connection:
            # FORCE derruba conexões penduradas de uma execução anterior.
            connection.execute(text(f"DROP DATABASE IF EXISTS {TEST_DATABASE_NAME} WITH (FORCE)"))
            connection.execute(text(f"CREATE DATABASE {TEST_DATABASE_NAME}"))
    except OperationalError:
        pytest.skip("Postgres não está no ar. Suba com: docker compose up -d")

    admin_engine.dispose()

    engine = create_engine(admin_url.rsplit("/", 1)[0] + f"/{TEST_DATABASE_NAME}")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(test_engine):
    """Sessão com o banco vazio: cada teste começa do zero."""
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
    with Session(test_engine) as session:
        session.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        session.commit()
        yield session
