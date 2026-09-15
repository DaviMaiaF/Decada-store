"""Fixtures compartilhadas.

Os testes marcados com `db` usam um banco separado (`decada_test`) no mesmo
Postgres do docker compose, recriado a cada execução da suíte. As tabelas vêm
de `create_all` e não do Alembic: é mais rápido, e a migração já tem seu
próprio teste de ida e volta feito na etapa 1.

**O catálogo do seed é carregado uma única vez por execução**, logo depois de
criar as tabelas, e cada teste roda dentro de uma transação que sempre sofre
rollback no fim. Duas consequências:

- O teste recebe o banco já com o catálogo (120 produtos, 3 mercados, 1080
  preços, 10 receitas). Quem precisa do banco limpo pede `banco_vazio`.
- O teste não precisa limpar nada. Nada do que ele escreveu — nem o que as
  rotas escreveram, que dão `commit` de verdade — sobrevive ao rollback.

Antes, cada teste ressemeava o catálogo do zero: eram 43 cargas por execução,
cada uma com 1080 `merge` de preço e um bcrypt, e a suíte levava cinco minutos.
"""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Base, Product, User
from app.seeds.catalog import PRODUCTS
from app.services.security import hash_password
from app.services.text import normalize_text

TEST_DATABASE_NAME = "decada_test"

SENHA_DE_TESTE = "senha-de-teste"
# bcrypt é lento de propósito. Calcular o hash uma vez por sessão em vez de uma
# vez por teste tira segundos da suíte.
HASH_DE_TESTE = hash_password(SENHA_DE_TESTE)


def novo_usuario(email: str, **campos) -> User:
    """Usuário de teste já com senha, que passou a ser obrigatória na etapa 10."""
    return User(email=email, password_hash=HASH_DE_TESTE, **campos)


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

    # A única carga do seed da execução inteira. Daqui em diante todo teste a
    # encontra pronta, e o rollback de cada teste a devolve intacta.
    from app.seeds.runner import run as carregar_seed

    with Session(engine) as sessao:
        carregar_seed(sessao)

    yield engine
    engine.dispose()


@pytest.fixture
def _conexao(test_engine):
    """Conexão do teste, dentro de uma transação que nunca é confirmada.

    O rollback no fim desfaz tudo — inclusive o que veio de um `commit` da
    aplicação, que a sessão do teste transforma em savepoint.
    """
    with test_engine.connect() as conexao:
        transacao = conexao.begin()
        try:
            yield conexao
        finally:
            transacao.rollback()


@pytest.fixture
def db_session(_conexao):
    """Sessão com o catálogo do seed carregado.

    `join_transaction_mode="create_savepoint"` é o que segura o isolamento: o
    `commit()` que as rotas dão libera um savepoint em vez de confirmar a
    transação externa, então o rollback do fim ainda alcança tudo.
    """
    with Session(_conexao, join_transaction_mode="create_savepoint") as session:
        yield session


@pytest.fixture
def banco_vazio(db_session):
    """Esvazia o banco para quem precisa provar algo sobre a carga em si.

    `TRUNCATE` é transacional no Postgres: some dentro deste teste e o catálogo
    volta no rollback, sem custo para o teste seguinte.
    """
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
    db_session.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    return db_session


@pytest.fixture(scope="session")
def catalogo() -> list[Product]:
    """Os 120 produtos do seed como objetos Product, sem passar pelo banco.

    O casamento item–produto não precisa de sessão para funcionar, e manter
    esses testes fora do banco os deixa na casa dos milissegundos.
    """
    return [
        Product(
            name=produto.name,
            slug=str(indice),
            normalized_name=normalize_text(produto.name),
            brand=produto.brand,
            package_size=produto.package_size,
            package_unit=produto.package_unit,
            base_unit=produto.base_unit,
            category=produto.category,
            is_fictitious=True,
        )
        for indice, produto in enumerate(PRODUCTS)
    ]


@pytest.fixture
def client(db_session):
    """Cliente HTTP usando a sessão de teste, com o catálogo já carregado."""
    from fastapi.testclient import TestClient

    from app.core.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as cliente:
        yield cliente
    app.dependency_overrides.clear()


@pytest.fixture
def marina(db_session) -> User:
    pessoa = novo_usuario("marina@example.com")
    db_session.add(pessoa)
    db_session.commit()
    return pessoa


@pytest.fixture
def outra_pessoa(db_session) -> User:
    pessoa = novo_usuario("outra@example.com")
    db_session.add(pessoa)
    db_session.commit()
    return pessoa
