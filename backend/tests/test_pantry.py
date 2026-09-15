"""Testes da despensa.

O cálculo de cobertura é função pura sobre objetos em memória e não toca no
banco. Só a leitura da despensa de um usuário e a sugestão de produtos precisam
de Postgres.
"""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import PantryItem, Product
from app.models.enums import BaseUnit, MeasurementUnit
from app.services.pantry import (
    available_quantity,
    coverage,
    suggest_products,
    user_pantry,
)
from app.services.units import IncompatibleUnitError
from tests.conftest import novo_usuario

KG = MeasurementUnit.QUILOGRAMA
G = MeasurementUnit.GRAMA
ML = MeasurementUnit.MILILITRO
UN = MeasurementUnit.UNIDADE


def _produto(base_unit: BaseUnit = BaseUnit.QUILOGRAMA) -> Product:
    """Produto solto, com id, sem passar pelo banco."""
    return Product(
        id=uuid.uuid4(),
        slug="peito-de-frango",
        name="Peito de frango sem pele",
        normalized_name="peito de frango sem pele",
        base_unit=base_unit,
    )


def _na_despensa(produto: Product | None, quantidade: str | None, unidade=None) -> PantryItem:
    return PantryItem(
        user_id=uuid.uuid4(),
        raw_description="item de teste",
        product_id=produto.id if produto else None,
        quantity=Decimal(quantidade) if quantidade is not None else None,
        unit=unidade,
    )


# --------------------------------------------------------------------------
# abatimento parcial
# --------------------------------------------------------------------------

def test_desconta_o_que_ja_tem_em_casa():
    # A regra da etapa 5: precisa de 1,2 kg, tem 0,5 kg, compra 0,7 kg.
    frango = _produto()
    despensa = [_na_despensa(frango, "0.5", KG)]

    cobertura = coverage(Decimal("1.2"), KG, frango, despensa)

    assert cobertura.needed == Decimal("1.200")
    assert cobertura.available == Decimal("0.500")
    assert cobertura.to_buy == Decimal("0.700")
    assert cobertura.fully_covered is False


def test_despensa_vazia_manda_comprar_tudo():
    frango = _produto()

    cobertura = coverage(Decimal("1.2"), KG, frango, [])

    assert cobertura.available == Decimal("0.000")
    assert cobertura.to_buy == Decimal("1.200")
    assert cobertura.has_unmeasured_items is False


def test_quantidade_exata_cobre_a_compra():
    frango = _produto()

    cobertura = coverage(Decimal("1.2"), KG, frango, [_na_despensa(frango, "1.2", KG)])

    assert cobertura.to_buy == Decimal("0.000")
    assert cobertura.fully_covered is True


def test_ter_mais_do_que_precisa_nao_gera_quantidade_negativa():
    frango = _produto()

    cobertura = coverage(Decimal("1.2"), KG, frango, [_na_despensa(frango, "3", KG)])

    assert cobertura.to_buy == Decimal("0.000")
    assert cobertura.fully_covered is True


def test_soma_varios_itens_do_mesmo_produto():
    # Duas embalagens abertas do mesmo produto somam antes de abater.
    frango = _produto()
    despensa = [_na_despensa(frango, "0.3", KG), _na_despensa(frango, "0.45", KG)]

    cobertura = coverage(Decimal("1.2"), KG, frango, despensa)

    assert cobertura.available == Decimal("0.750")
    assert cobertura.to_buy == Decimal("0.450")


def test_itens_de_outros_produtos_nao_interferem():
    frango = _produto()
    outro = _produto()

    cobertura = coverage(Decimal("1.2"), KG, frango, [_na_despensa(outro, "5", KG)])

    assert cobertura.available == Decimal("0.000")
    assert cobertura.to_buy == Decimal("1.200")


def test_item_ainda_nao_casado_com_o_catalogo_nao_abate():
    # product_id nulo é item que o usuário digitou mas ainda não confirmou.
    frango = _produto()

    cobertura = coverage(Decimal("1.2"), KG, frango, [_na_despensa(None, "0.5", KG)])

    assert cobertura.to_buy == Decimal("1.200")


# --------------------------------------------------------------------------
# conversão de unidade
# --------------------------------------------------------------------------

def test_converte_a_despensa_para_a_unidade_base_do_produto():
    # 500 g em casa contra um produto vendido por quilo.
    frango = _produto()

    cobertura = coverage(Decimal("1.2"), KG, frango, [_na_despensa(frango, "500", G)])

    assert cobertura.available == Decimal("0.500")
    assert cobertura.to_buy == Decimal("0.700")


def test_converte_tambem_a_quantidade_pedida():
    frango = _produto()

    cobertura = coverage(Decimal("1200"), G, frango, [_na_despensa(frango, "0.5", KG)])

    assert cobertura.needed == Decimal("1.200")
    assert cobertura.to_buy == Decimal("0.700")
    assert cobertura.base_unit is BaseUnit.QUILOGRAMA


def test_quantidade_pedida_em_grandeza_errada_e_erro():
    # Pedir 500 ml de um produto vendido por quilo é erro de quem chamou.
    frango = _produto()

    with pytest.raises(IncompatibleUnitError):
        coverage(Decimal("500"), ML, frango, [])


def test_produto_vendido_por_unidade():
    ovos = _produto(BaseUnit.UNIDADE)

    cobertura = coverage(Decimal("12"), UN, ovos, [_na_despensa(ovos, "8", UN)])

    assert cobertura.to_buy == Decimal("4.000")


# --------------------------------------------------------------------------
# o que não foi medido não abate
# --------------------------------------------------------------------------

def test_item_sem_quantidade_nao_abate_mas_sinaliza():
    # "Tenho azeite em casa" não diz quanto. Abater seria inventar o número.
    frango = _produto()

    cobertura = coverage(Decimal("1.2"), KG, frango, [_na_despensa(frango, None)])

    assert cobertura.available == Decimal("0.000")
    assert cobertura.to_buy == Decimal("1.200")
    assert cobertura.has_unmeasured_items is True


def test_item_com_quantidade_mas_sem_unidade_tambem_nao_abate():
    frango = _produto()
    item = _na_despensa(frango, "2")

    cobertura = coverage(Decimal("1.2"), KG, frango, [item])

    assert cobertura.to_buy == Decimal("1.200")
    assert cobertura.has_unmeasured_items is True


def test_unidade_de_outra_grandeza_na_despensa_nao_abate():
    # Alguém cadastrou o frango em mililitros: não há conversão para quilo.
    frango = _produto()

    cobertura = coverage(Decimal("1.2"), KG, frango, [_na_despensa(frango, "500", ML)])

    assert cobertura.available == Decimal("0.000")
    assert cobertura.to_buy == Decimal("1.200")
    assert cobertura.has_unmeasured_items is True


def test_o_que_foi_medido_abate_mesmo_com_item_sem_quantidade_ao_lado():
    frango = _produto()
    despensa = [_na_despensa(frango, "0.5", KG), _na_despensa(frango, None)]

    cobertura = coverage(Decimal("1.2"), KG, frango, despensa)

    assert cobertura.to_buy == Decimal("0.700")
    assert cobertura.has_unmeasured_items is True


def test_available_quantity_devolve_a_soma_e_o_sinal():
    frango = _produto()
    despensa = [_na_despensa(frango, "0.5", KG), _na_despensa(frango, None)]

    total, tem_item_sem_medida = available_quantity(despensa, frango)

    assert total == Decimal("0.500")
    assert tem_item_sem_medida is True


# --------------------------------------------------------------------------
# despensa no banco
# --------------------------------------------------------------------------

@pytest.fixture
def usuario_com_despensa(db_session):
    """Um usuário com três itens na despensa e o catálogo do seed carregado."""
    aveia = db_session.scalars(select(Product).where(Product.name == "Aveia em flocos")).one()

    usuario = novo_usuario(
        "marina@decada.local",
        pantry_items=[
            PantryItem(
                raw_description="aveia em flocos finos (aberto)",
                normalized_description="aveia em flocos finos aberto",
                product=aveia,
                quantity=Decimal("300"),
                unit=G,
            ),
            PantryItem(raw_description="azeite extravirgem"),
            PantryItem(raw_description="canela em pó"),
        ],
    )
    db_session.add(usuario)
    db_session.commit()
    return usuario


@pytest.mark.db
def test_despensa_e_do_usuario(db_session, usuario_com_despensa):

    outro = novo_usuario(
        "outro@decada.local",
        pantry_items=[PantryItem(raw_description="feijão carioca")],
    )
    db_session.add(outro)
    db_session.commit()

    itens = user_pantry(db_session, usuario_com_despensa.id)

    assert len(itens) == 3
    assert all(item.user_id == usuario_com_despensa.id for item in itens)


@pytest.mark.db
def test_item_sem_produto_e_sem_quantidade_e_valido(db_session, usuario_com_despensa):
    # A tela deixa cadastrar "canela em pó" e nada mais. O banco tem que aceitar.
    itens = user_pantry(db_session, usuario_com_despensa.id)
    canela = next(item for item in itens if item.raw_description == "canela em pó")

    assert canela.product_id is None
    assert canela.quantity is None
    assert canela.unit is None


@pytest.mark.db
def test_apagar_o_usuario_apaga_a_despensa(db_session, usuario_com_despensa):
    db_session.delete(usuario_com_despensa)
    db_session.commit()

    assert db_session.scalars(select(PantryItem)).all() == []


@pytest.mark.db
def test_sugere_produtos_do_catalogo_para_o_texto_digitado(db_session, usuario_com_despensa):
    item = PantryItem(
        user_id=usuario_com_despensa.id, raw_description="aveia em flocos finos"
    )

    sugestoes = suggest_products(db_session, item)

    assert sugestoes[0].product.name == "Aveia em flocos"
    # Sugerir não é casar: quem confirma é o usuário, e até lá product_id é nulo.
    assert item.product_id is None


@pytest.mark.db
def test_cobertura_usando_a_despensa_gravada(db_session, usuario_com_despensa):
    aveia = db_session.scalars(select(Product).where(Product.name == "Aveia em flocos")).one()
    despensa = user_pantry(db_session, usuario_com_despensa.id)

    cobertura = coverage(Decimal("500"), G, aveia, despensa)

    assert cobertura.available == Decimal("0.300")
    assert cobertura.to_buy == Decimal("0.200")
