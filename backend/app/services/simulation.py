"""Simulação de cenário da lista de compras.

Responde "e se eu levasse outra quantidade disto?" sem gravar nada e sem tocar
na prescrição — a decisão 8 é clara: o app compara o custo do que foi prescrito,
nunca decide que a pessoa deve levar outra coisa.

Duas escolhas sustentam o resultado:

**O preço é o que a lista congelou.** `unit_price_snapshot` é o retrato do
momento em que a lista foi gerada. Consultar o preço de novo faria a simulação
misturar duas mudanças — a quantidade que a pessoa mexeu e a coleta que chegou
no meio — e a comparação deixaria de responder à pergunta feita.

**O arredondamento é o mesmo da compra de verdade.** Produto embalado sobe de
pacote em pacote, e é por isso que esta conta não pode morar na tela: lá,
dobrar a quantidade viraria dobrar o preço, o que é falso para tudo que vem
embalado.
"""

import uuid
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.models import ShoppingListItem
from app.services.pricing import quantity_to_charge
from app.services.units import IncompatibleUnitError, to_base_quantity

_MONEY = Decimal("0.01")


@dataclass(frozen=True)
class SimulatedItem:
    """Um item da lista sob uma quantidade hipotética."""

    item_id: uuid.UUID
    # Na unidade do item, como a pessoa digitou.
    quantity: Decimal
    # Na unidade base do produto, já com a embalagem fechada.
    quantity_charged: Decimal
    packages_needed: int | None
    # Nulo quando não há preço congelado: zero seria mentira, como na geração.
    estimated_cost: Decimal | None


def simulate_item(item: ShoppingListItem, quantity: Decimal) -> SimulatedItem:
    """Custo do item se a quantidade fosse outra.

    Item sem preço congelado continua sem custo. Unidade que não converte para a
    grandeza do produto também: inventar a conversão produziria preço por litro
    de coisa vendida a quilo.
    """
    try:
        quantity_in_base = to_base_quantity(quantity, item.unit, item.product.base_unit)
    except IncompatibleUnitError:
        return SimulatedItem(
            item_id=item.id,
            quantity=quantity,
            quantity_charged=Decimal("0"),
            packages_needed=None,
            estimated_cost=None,
        )

    charged, packages = quantity_to_charge(quantity_in_base, item.product)

    if item.unit_price_snapshot is None:
        cost = None
    else:
        cost = (item.unit_price_snapshot * charged).quantize(_MONEY, ROUND_HALF_UP)

    return SimulatedItem(
        item_id=item.id,
        quantity=quantity,
        quantity_charged=charged,
        packages_needed=packages,
        estimated_cost=cost,
    )
