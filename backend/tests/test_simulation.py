"""Testes da simulação de cenário.

Função pura: não toca no banco. Os objetos são montados à mão porque o que
importa aqui é a conta, não a persistência.
"""

import uuid
from decimal import Decimal

from app.models import Product, ShoppingListItem
from app.models.enums import BaseUnit, MeasurementUnit
from app.services.simulation import simulate_item


def _produto(**campos) -> Product:
    padrao = {
        "name": "Aveia em flocos",
        "normalized_name": "aveia em flocos",
        "base_unit": BaseUnit.QUILOGRAMA,
        "package_size": Decimal("0.500"),
        "package_unit": MeasurementUnit.QUILOGRAMA,
        "is_fictitious": True,
    }
    return Product(**{**padrao, **campos})


def _item(produto: Product, **campos) -> ShoppingListItem:
    padrao = {
        "quantity": Decimal("0.300"),
        "unit": MeasurementUnit.QUILOGRAMA,
        "quantity_from_pantry": Decimal("0.000"),
        "unit_price_snapshot": Decimal("31.60"),
    }
    item = ShoppingListItem(**{**padrao, **campos})
    item.id = uuid.uuid4()
    item.product = produto
    return item


def test_produto_embalado_sobe_de_pacote_em_pacote():
    # Pacote de 500 g a R$ 31,60/kg: um pacote custa R$ 15,80.
    item = _item(_produto())

    um_pacote = simulate_item(item, Decimal("0.300"))
    ainda_um = simulate_item(item, Decimal("0.500"))
    dois = simulate_item(item, Decimal("0.600"))

    assert um_pacote.estimated_cost == Decimal("15.80")
    # 200 g a mais não custam nada: o pacote já estava no carrinho.
    assert ainda_um.estimated_cost == Decimal("15.80")
    # Passar de 500 g obriga o segundo pacote, e aí o preço dobra de uma vez.
    assert dois.estimated_cost == Decimal("31.60")
    assert dois.packages_needed == 2


def test_a_conta_proporcional_da_tela_erraria():
    """É por isto que a simulação não pode ser feita no cliente.

    Multiplicar preço por quantidade é o que uma tela faria naturalmente, e dá
    errado para tudo que vem embalado: sai barato demais quando sobra pacote.
    """
    item = _item(_produto())

    real = simulate_item(item, Decimal("0.300")).estimated_cost
    proporcional = Decimal("31.60") * Decimal("0.300")

    assert proporcional == Decimal("9.480")
    assert real == Decimal("15.80")


def test_produto_a_granel_e_proporcional():
    granel = _produto(name="Banana prata", package_size=None, package_unit=None)
    item = _item(granel)

    meio = simulate_item(item, Decimal("0.500"))
    inteiro = simulate_item(item, Decimal("1.000"))

    assert meio.estimated_cost == Decimal("15.80")
    assert inteiro.estimated_cost == Decimal("31.60")
    assert inteiro.packages_needed is None


def test_converte_a_unidade_antes_de_calcular():
    item = _item(_produto())

    em_gramas = simulate_item(item, Decimal("600"))
    em_quilos = simulate_item(item, Decimal("0.600"))
    em_gramas_convertido = simulate_item(
        _item(_produto(), unit=MeasurementUnit.GRAMA), Decimal("600")
    )

    # 600 "unidades" da unidade do item: o item está em kg, então são 600 kg.
    assert em_gramas.estimated_cost != em_quilos.estimated_cost
    # Já o item medido em grama trata 600 como 600 g.
    assert em_gramas_convertido.estimated_cost == Decimal("31.60")


def test_item_sem_preco_congelado_continua_sem_custo():
    item = _item(_produto(), unit_price_snapshot=None)

    simulado = simulate_item(item, Decimal("1.000"))

    # Zero seria mentira, do mesmo jeito que é na geração da lista.
    assert simulado.estimated_cost is None
    assert simulado.packages_needed == 2


def test_unidade_de_outra_grandeza_nao_inventa_conversao():
    item = _item(_produto(), unit=MeasurementUnit.MILILITRO)

    simulado = simulate_item(item, Decimal("500"))

    assert simulado.estimated_cost is None
    assert simulado.quantity_charged == Decimal("0")


def test_a_simulacao_nao_altera_o_item():
    item = _item(_produto())

    simulate_item(item, Decimal("5.000"))

    # Nada de gravar: a lista salva continua sendo a lista salva.
    assert item.quantity == Decimal("0.300")
    assert item.unit_price_snapshot == Decimal("31.60")
