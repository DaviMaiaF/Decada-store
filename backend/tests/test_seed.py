"""Testes da carga de dados fictícios.

Todos usam o banco `decada_test`: o objetivo é provar idempotência, que só
existe de verdade contra um banco real.
"""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import Market, PriceRecord, Product, Recipe
from app.models.enums import PriceOrigin
from app.seeds.runner import COLLECTION_DAYS_AGO, run

pytestmark = pytest.mark.db


def _contagens(session):
    return {
        "markets": session.scalar(select(func.count()).select_from(Market)),
        "products": session.scalar(select(func.count()).select_from(Product)),
        "prices": session.scalar(select(func.count()).select_from(PriceRecord)),
        "recipes": session.scalar(select(func.count()).select_from(Recipe)),
    }


def test_carrega_o_catalogo_completo(db_session):
    resumo = run(db_session)

    assert (resumo.markets, resumo.products, resumo.price_records) == (3, 120, 1080)
    assert resumo.recipes == 10
    assert _contagens(db_session) == {
        "markets": 3,
        "products": 120,
        "prices": 1080,
        "recipes": 10,
    }


def test_rodar_duas_vezes_nao_duplica(db_session):
    run(db_session)
    precos_da_primeira = set(db_session.scalars(select(PriceRecord.id)).all())
    receitas_da_primeira = set(db_session.scalars(select(Recipe.id)).all())

    run(db_session)

    assert _contagens(db_session) == {
        "markets": 3,
        "products": 120,
        "prices": 1080,
        "recipes": 10,
    }
    # Mesmos identificadores: a segunda carga atualizou as linhas, não criou outras.
    assert set(db_session.scalars(select(PriceRecord.id)).all()) == precos_da_primeira
    assert set(db_session.scalars(select(Recipe.id)).all()) == receitas_da_primeira


def test_todo_dado_carregado_e_identificavel_como_ficticio(db_session):
    run(db_session)

    produtos_reais = select(Product).where(Product.is_fictitious.is_(False))
    mercados_reais = select(Market).where(Market.is_fictitious.is_(False))
    receitas_reais = select(Recipe).where(Recipe.is_fictitious.is_(False))
    assert db_session.scalars(produtos_reais).first() is None
    assert db_session.scalars(mercados_reais).first() is None
    assert db_session.scalars(receitas_reais).first() is None

    origens = set(db_session.scalars(select(PriceRecord.origin).distinct()).all())
    assert origens == {PriceOrigin.SEED}


def test_mercado_ficticio_nao_tem_cnpj(db_session):
    # CNPJ é identificador de empresa real; inventar um seria pior que deixar nulo.
    run(db_session)
    assert db_session.scalars(select(Market.cnpj).distinct()).all() == [None]


def test_precos_cobrem_as_tres_faixas_de_confianca(db_session):
    # A etapa 4 classifica em atual (até 7 dias), recente (até 30) e estimativa
    # (acima de 30). O seed precisa produzir pelo menos um registro em cada uma,
    # senão a etapa 4 não terá como testar o caso do preço vencido.
    run(db_session)
    agora = datetime.now(timezone.utc)

    idades = [
        (agora - coletado_em).days
        for coletado_em in db_session.scalars(select(PriceRecord.collected_at)).all()
    ]
    assert set(idades) == set(COLLECTION_DAYS_AGO)

    assert any(idade <= 7 for idade in idades), "falta preço na faixa 'atual'"
    assert any(7 < idade <= 30 for idade in idades), "falta preço na faixa 'recente'"
    assert any(idade > 30 for idade in idades), "falta preço na faixa 'estimativa'"


def test_cada_produto_tem_tres_coletas_em_cada_mercado(db_session):
    run(db_session)

    contagem_por_par = db_session.execute(
        select(func.count())
        .select_from(PriceRecord)
        .group_by(PriceRecord.product_id, PriceRecord.market_id)
    ).scalars().all()

    assert len(contagem_por_par) == 120 * 3
    assert set(contagem_por_par) == {3}


def test_os_mesmos_precos_saem_em_toda_execucao(db_session):
    # O gerador tem semente fixa: o número mostrado na banca é reproduzível.
    run(db_session)
    primeira = dict(
        db_session.execute(select(PriceRecord.id, PriceRecord.price_per_base_unit)).all()
    )

    run(db_session)
    segunda = dict(
        db_session.execute(select(PriceRecord.id, PriceRecord.price_per_base_unit)).all()
    )

    assert primeira == segunda


def test_preco_do_pacote_bate_com_o_preco_por_unidade_base(db_session):
    # Queijo minas frescal é vendido em pacote de 500 g, com base em R$/kg:
    # o preço do pacote tem que ser metade do preço do quilo.
    run(db_session)

    registro = db_session.scalars(
        select(PriceRecord)
        .join(Product)
        .where(Product.name == "Queijo minas frescal")
        .limit(1)
    ).one()

    esperado = (registro.price_per_base_unit * Decimal("0.5")).quantize(Decimal("0.01"))
    assert registro.unit_price == esperado


def test_produto_a_granel_tem_preco_igual_ao_da_unidade_base(db_session):
    # Banana é vendida por quilo: preço do cupom e preço por kg são o mesmo número.
    run(db_session)

    registro = db_session.scalars(
        select(PriceRecord).join(Product).where(Product.name == "Banana prata").limit(1)
    ).one()

    assert registro.unit_price == registro.price_per_base_unit.quantize(Decimal("0.01"))
