"""Testes estruturais do modelo de dados.

Não tocam no banco: verificam o metadata do SQLAlchemy. O objetivo é travar as
decisões de modelagem que a aplicação depende — principalmente as regras de
exclusão, que são requisito de LGPD.
"""

import pytest

from app.models import Base

TABELAS_ESPERADAS = {
    "users",
    "meal_plans",
    "plan_items",
    "products",
    "markets",
    "price_records",
    "shopping_lists",
    "shopping_list_items",
    "recipes",
    "recipe_ingredients",
}


def _regra_de_exclusao(nome_da_tabela: str, nome_da_coluna: str) -> str | None:
    """Devolve o ON DELETE declarado na chave estrangeira da coluna."""
    tabela = Base.metadata.tables[nome_da_tabela]
    for chave_estrangeira in tabela.c[nome_da_coluna].foreign_keys:
        return chave_estrangeira.ondelete
    raise AssertionError(f"{nome_da_tabela}.{nome_da_coluna} não é chave estrangeira")


def test_todas_as_tabelas_do_dominio_existem():
    assert set(Base.metadata.tables) == TABELAS_ESPERADAS


def test_excluir_usuario_apaga_os_planos_alimentares():
    # LGPD: exclusão sob demanda precisa levar embora o dado de saúde.
    assert _regra_de_exclusao("meal_plans", "user_id") == "CASCADE"
    assert _regra_de_exclusao("plan_items", "meal_plan_id") == "CASCADE"


def test_excluir_usuario_preserva_os_precos_anonimizados():
    # Os preços são bem coletivo: sobrevivem à exclusão, sem vínculo com a pessoa.
    assert _regra_de_exclusao("price_records", "user_id") == "SET NULL"
    assert Base.metadata.tables["price_records"].c.user_id.nullable is True


def test_produto_com_preco_nao_pode_ser_apagado_por_acidente():
    assert _regra_de_exclusao("shopping_list_items", "product_id") == "RESTRICT"
    assert _regra_de_exclusao("recipe_ingredients", "product_id") == "RESTRICT"
    assert _regra_de_exclusao("price_records", "market_id") == "RESTRICT"


def test_registro_de_preco_e_historico_imutavel():
    # Fato histórico não é atualizado: não faz sentido ter updated_at.
    colunas = Base.metadata.tables["price_records"].c
    assert "created_at" in colunas
    assert "updated_at" not in colunas


@pytest.mark.parametrize(
    ("tabela", "colunas"),
    [
        ("price_records", ("collected_at", "origin", "state_code", "city")),
        ("shopping_list_items", ("price_reference_date", "price_origin", "price_confidence")),
    ],
)
def test_todo_preco_carrega_data_e_origem(tabela, colunas):
    # Regra do projeto: nenhum número de preço trafega sem data e origem.
    for coluna in colunas:
        assert coluna in Base.metadata.tables[tabela].c


def test_um_item_do_plano_aparece_uma_vez_por_lista():
    restricoes = {
        restricao.name for restricao in Base.metadata.tables["shopping_list_items"].constraints
    }
    assert "uq_shopping_list_items_lista_item" in restricoes


def test_consentimento_lgpd_e_obrigatorio_no_plano():
    colunas = Base.metadata.tables["meal_plans"].c
    assert colunas.consent_at.nullable is False
    assert colunas.consent_version.nullable is False
