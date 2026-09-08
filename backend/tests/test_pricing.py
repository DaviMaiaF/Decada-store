"""Testes do cálculo de preço.

A parte pura (agregação e classificação de confiança) não toca no banco.
Só o cálculo do custo de uma lista de compras precisa de Postgres.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.enums import BaseUnit, PriceConfidence, PriceOrigin
from app.services.pricing import (
    MINIMUM_SAMPLES,
    PriceSample,
    aggregate_prices,
    classify_confidence,
)

AGORA = datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)


def _amostra(
    valor: str, dias_atras: int = 3, origem: PriceOrigin = PriceOrigin.SEED
) -> PriceSample:
    return PriceSample(
        price_per_base_unit=Decimal(valor),
        collected_at=AGORA - timedelta(days=dias_atras),
        origin=origem,
    )


# --------------------------------------------------------------------------
# agregação
# --------------------------------------------------------------------------

def test_calcula_as_medidas_de_posicao_e_dispersao():
    amostras = [_amostra("10.00"), _amostra("12.00"), _amostra("20.00")]

    agregado = aggregate_prices(amostras, BaseUnit.QUILOGRAMA, reference=AGORA)

    assert agregado.average == Decimal("14.0000")
    assert agregado.median == Decimal("12.0000")
    assert agregado.minimum == Decimal("10.0000")
    assert agregado.maximum == Decimal("20.0000")
    assert agregado.stddev == Decimal("5.2915")
    assert agregado.sample_size == 3


def test_mediana_com_numero_par_de_amostras():
    amostras = [_amostra("10.00"), _amostra("12.00"), _amostra("14.00"), _amostra("20.00")]

    agregado = aggregate_prices(amostras, BaseUnit.QUILOGRAMA, reference=AGORA)
    assert agregado.median == Decimal("13.0000")


def test_uma_amostra_nao_tem_desvio_padrao():
    # Desvio de um número só não existe; devolver zero mentiria sobre a dispersão.
    agregado = aggregate_prices([_amostra("10.00")], BaseUnit.QUILOGRAMA, reference=AGORA)

    assert agregado.stddev is None
    assert agregado.average == Decimal("10.0000")


def test_sem_amostra_nao_ha_preco():
    # Região sem coleta não vale zero: vale "não sei".
    assert aggregate_prices([], BaseUnit.QUILOGRAMA, reference=AGORA) is None


def test_carrega_a_unidade_base_junto_do_numero():
    agregado = aggregate_prices([_amostra("5.49")], BaseUnit.LITRO, reference=AGORA)

    assert agregado.base_unit is BaseUnit.LITRO


# --------------------------------------------------------------------------
# amostra insuficiente
# --------------------------------------------------------------------------

@pytest.mark.parametrize("quantidade", [1, 2])
def test_menos_de_tres_amostras_sinaliza_baixa_confianca(quantidade):
    amostras = [_amostra("10.00") for _ in range(quantidade)]

    agregado = aggregate_prices(amostras, BaseUnit.QUILOGRAMA, reference=AGORA)

    assert agregado.low_sample is True
    # A média continua sendo devolvida — sinalizada, não escondida.
    assert agregado.average == Decimal("10.0000")


def test_tres_amostras_ja_e_amostra_suficiente():
    amostras = [_amostra("10.00") for _ in range(MINIMUM_SAMPLES)]

    assert aggregate_prices(amostras, BaseUnit.QUILOGRAMA, reference=AGORA).low_sample is False


def test_baixa_amostra_e_independente_da_idade_do_preco():
    # Preço de ontem com uma amostra só: recente e pouco confiável ao mesmo tempo.
    agregado = aggregate_prices(
        [_amostra("10.00", dias_atras=1)], BaseUnit.QUILOGRAMA, reference=AGORA
    )

    assert agregado.confidence is PriceConfidence.ATUAL
    assert agregado.low_sample is True


# --------------------------------------------------------------------------
# confiança pela idade
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("dias", "esperado"),
    [
        (0, PriceConfidence.ATUAL),
        (3, PriceConfidence.ATUAL),
        (7, PriceConfidence.ATUAL),
        (8, PriceConfidence.RECENTE),
        (18, PriceConfidence.RECENTE),
        (30, PriceConfidence.RECENTE),
        (31, PriceConfidence.ESTIMATIVA),
        (45, PriceConfidence.ESTIMATIVA),
    ],
)
def test_classifica_a_confianca_pela_idade(dias, esperado):
    assert classify_confidence(AGORA - timedelta(days=dias), reference=AGORA) is esperado


def test_a_confianca_do_agregado_vem_da_coleta_mais_recente():
    # A média mistura coletas de idades diferentes; o selo segue a mais nova.
    amostras = [
        _amostra("10.00", dias_atras=45),
        _amostra("11.00", dias_atras=18),
        _amostra("12.00", dias_atras=3),
    ]

    agregado = aggregate_prices(amostras, BaseUnit.QUILOGRAMA, reference=AGORA)

    assert agregado.confidence is PriceConfidence.ATUAL
    assert agregado.latest_collected_at == AGORA - timedelta(days=3)


# --------------------------------------------------------------------------
# data e origem sempre junto
# --------------------------------------------------------------------------

def test_o_agregado_carrega_todas_as_origens_que_o_formaram():
    amostras = [
        _amostra("10.00", dias_atras=20, origem=PriceOrigin.SEED),
        _amostra("11.00", dias_atras=2, origem=PriceOrigin.NFCE),
    ]

    agregado = aggregate_prices(amostras, BaseUnit.QUILOGRAMA, reference=AGORA)

    assert agregado.origins == frozenset({PriceOrigin.SEED, PriceOrigin.NFCE})


def test_a_origem_representativa_e_a_da_coleta_mais_recente():
    # É a que cabe na coluna de snapshot da lista de compras.
    amostras = [
        _amostra("10.00", dias_atras=20, origem=PriceOrigin.SEED),
        _amostra("11.00", dias_atras=2, origem=PriceOrigin.NFCE),
    ]

    agregado = aggregate_prices(amostras, BaseUnit.QUILOGRAMA, reference=AGORA)
    assert agregado.latest_origin is PriceOrigin.NFCE


def test_nenhum_numero_viaja_sem_data_amostra_e_origem():
    agregado = aggregate_prices([_amostra("10.00")], BaseUnit.QUILOGRAMA, reference=AGORA)

    assert agregado.latest_collected_at is not None
    assert agregado.sample_size >= 1
    assert agregado.origins
    assert agregado.latest_origin is not None


# --------------------------------------------------------------------------
# custo da lista de compras (precisam de banco)
# --------------------------------------------------------------------------

@pytest.fixture
def lista_de_compras(db_session):
    """Uma lista com queijo (embalado) e frango (granel), pronta para precificar."""
    from app.models import MealPlan, PlanItem, Product, ShoppingList, ShoppingListItem, User
    from app.models.enums import MeasurementUnit
    from app.seeds.runner import run as carregar_seed

    carregar_seed(db_session)

    def produto(nome):
        return db_session.scalars(select(Product).where(Product.name == nome)).one()

    plano = MealPlan(
        user=User(email="teste@nutricart.local"),
        consent_at=AGORA,
        consent_version="v1",
        items=[
            PlanItem(position=1, raw_description="300 g de queijo minas frescal",
                     quantity=Decimal("300"), unit=MeasurementUnit.GRAMA),
            PlanItem(position=2, raw_description="1,2 kg de peito de frango",
                     quantity=Decimal("1.2"), unit=MeasurementUnit.QUILOGRAMA),
        ],
    )
    db_session.add(plano)
    db_session.flush()

    lista = ShoppingList(
        meal_plan=plano,
        state_code="DF",
        city="Brasília",
        items=[
            ShoppingListItem(plan_item=plano.items[0], product=produto("Queijo minas frescal"),
                             quantity=Decimal("300"), unit=MeasurementUnit.GRAMA),
            ShoppingListItem(plan_item=plano.items[1], product=produto("Peito de frango sem pele"),
                             quantity=Decimal("1.2"), unit=MeasurementUnit.QUILOGRAMA),
        ],
    )
    db_session.add(lista)
    db_session.flush()
    return lista


@pytest.mark.db
def test_preco_do_produto_sai_por_regiao(db_session, lista_de_compras):
    from app.services.pricing import product_price

    queijo = lista_de_compras.items[0].product
    brasilia = product_price(db_session, queijo, "DF", "Brasília")
    taguatinga = product_price(db_session, queijo, "DF", "Taguatinga")

    # Duas lojas em Brasília, uma em Taguatinga: 6 amostras contra 3.
    assert brasilia.sample_size == 6
    assert taguatinga.sample_size == 3
    assert brasilia.average != taguatinga.average


@pytest.mark.db
def test_regiao_sem_coleta_nao_tem_preco(db_session, lista_de_compras):
    from app.services.pricing import product_price

    queijo = lista_de_compras.items[0].product

    assert product_price(db_session, queijo, "SP", "Campinas") is None


@pytest.mark.db
def test_produto_embalado_custa_a_embalagem_fechada(db_session, lista_de_compras):
    from app.services.pricing import price_shopping_list, product_price

    price_shopping_list(db_session, lista_de_compras)
    item = lista_de_compras.items[0]  # 300 g de queijo, pacote de 500 g

    agregado = product_price(db_session, item.product, "DF", "Brasília")
    esperado = (agregado.average * Decimal("0.5")).quantize(Decimal("0.01"))

    # Paga-se o pacote inteiro de 500 g, não os 300 g prescritos.
    assert item.packages_needed == 1
    assert item.estimated_cost == esperado


@pytest.mark.db
def test_produto_a_granel_custa_a_quantidade_pedida(db_session, lista_de_compras):
    from app.services.pricing import price_shopping_list, product_price

    price_shopping_list(db_session, lista_de_compras)
    item = lista_de_compras.items[1]  # 1,2 kg de frango, vendido a granel

    agregado = product_price(db_session, item.product, "DF", "Brasília")
    esperado = (agregado.average * Decimal("1.2")).quantize(Decimal("0.01"))

    assert item.packages_needed is None
    assert item.estimated_cost == esperado


@pytest.mark.db
def test_o_total_e_a_soma_dos_itens(db_session, lista_de_compras):
    from app.services.pricing import price_shopping_list

    custo = price_shopping_list(db_session, lista_de_compras)

    assert custo.total == sum(item.estimated_cost for item in lista_de_compras.items)
    assert lista_de_compras.estimated_total == custo.total
    assert lista_de_compras.calculated_at is not None


@pytest.mark.db
def test_cada_item_guarda_o_retrato_do_preco(db_session, lista_de_compras):
    from app.services.pricing import price_shopping_list

    price_shopping_list(db_session, lista_de_compras)

    for item in lista_de_compras.items:
        assert item.unit_price_snapshot is not None
        assert item.price_reference_date is not None
        assert item.price_origin is not None
        assert item.price_confidence is not None
        assert item.price_sample_size == 6


@pytest.mark.db
def test_item_sem_preco_na_regiao_nao_entra_como_zero(db_session, lista_de_compras):
    from app.services.pricing import price_shopping_list

    lista_de_compras.city = "Campinas"
    lista_de_compras.state_code = "SP"
    db_session.flush()

    custo = price_shopping_list(db_session, lista_de_compras)

    assert custo.total == Decimal("0.00")
    assert custo.items_priced == 0
    assert custo.items_without_price == 2
    assert all(item.estimated_cost is None for item in lista_de_compras.items)


@pytest.mark.db
def test_o_selo_da_lista_e_o_pior_selo_entre_os_itens(db_session, lista_de_compras):
    from app.models import PriceRecord
    from app.services.pricing import price_shopping_list

    # Envelhece todas as coletas do frango além dos 30 dias.
    frango = lista_de_compras.items[1].product
    for registro in db_session.scalars(
        select(PriceRecord).where(PriceRecord.product_id == frango.id)
    ):
        registro.collected_at = datetime.now(timezone.utc) - timedelta(days=60)
    db_session.flush()

    custo = price_shopping_list(db_session, lista_de_compras)

    assert custo.lowest_confidence is PriceConfidence.ESTIMATIVA
