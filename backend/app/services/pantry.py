"""Quanto do que a lista de compras pede já está em casa.

Regras que este módulo faz valer:
  - o abatimento é parcial: precisa de 1,2 kg e tem 0,5 kg em casa, compra 0,7 kg;
  - item da despensa sem quantidade não abate nada — só sinaliza que existe;
  - item cuja unidade é de outra grandeza que a do produto também não abate;
  - a soma é feita na unidade base do produto (kg, l ou unidade);
  - ter mais do que precisa zera a compra, nunca produz quantidade negativa.

Não abater o que não foi medido é a mesma regra que vale para preço: melhor
mandar comprar de novo do que decidir por um número que ninguém informou.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PantryItem, Product
from app.models.enums import BaseUnit, MeasurementUnit
from app.services.matching import ScoredProduct, rank_products
from app.services.units import IncompatibleUnitError, to_base_quantity

# Mesma precisão das colunas de quantidade do banco, Numeric(12, 3).
_QUANTITY_PRECISION = Decimal("0.001")

_ZERO = Decimal("0.000")


@dataclass(frozen=True)
class PantryCoverage:
    """O quanto a despensa cobre de uma quantidade necessária.

    Todas as quantidades estão na unidade base do produto.
    """

    needed: Decimal
    # O que a despensa abate de fato: só o que tem quantidade e unidade compatível.
    available: Decimal
    # O que sobra para comprar. Nunca negativo.
    to_buy: Decimal
    fully_covered: bool
    # Há item deste produto na despensa que não entrou na conta — sem quantidade
    # ou em unidade de outra grandeza. Serve para a tela avisar "você já tem algo
    # disso em casa" sem que o número de compra tenha mudado.
    has_unmeasured_items: bool
    base_unit: BaseUnit


def _quantize(quantity: Decimal) -> Decimal:
    return quantity.quantize(_QUANTITY_PRECISION, ROUND_HALF_UP)


def available_quantity(
    pantry_items: Sequence[PantryItem], product: Product
) -> tuple[Decimal, bool]:
    """Quanto deste produto a despensa tem, na unidade base, e se algo ficou de fora.

    Função pura. Itens de outros produtos são ignorados.
    """
    total = _ZERO
    unmeasured = False

    for item in pantry_items:
        if item.product_id != product.id:
            continue

        if item.quantity is None or item.unit is None:
            unmeasured = True
            continue

        try:
            total += to_base_quantity(item.quantity, item.unit, product.base_unit)
        except IncompatibleUnitError:
            # Litro na despensa e produto vendido por quilo: somar seria inventar
            # uma conversão que não existe.
            unmeasured = True

    return _quantize(total), unmeasured


def coverage(
    quantity: Decimal,
    unit: MeasurementUnit,
    product: Product,
    pantry_items: Sequence[PantryItem],
) -> PantryCoverage:
    """Cobertura da despensa para uma quantidade necessária de um produto.

    Levanta `IncompatibleUnitError` se a quantidade pedida não for da mesma
    grandeza do produto — pedir 500 ml de um produto vendido por quilo é erro
    de quem chamou, não zero de cobertura.
    """
    needed = _quantize(to_base_quantity(quantity, unit, product.base_unit))
    available, unmeasured = available_quantity(pantry_items, product)

    to_buy = needed - available
    if to_buy < _ZERO:
        # Ter três quilos em casa não gera crédito de compra.
        to_buy = _ZERO

    return PantryCoverage(
        needed=needed,
        available=available,
        to_buy=_quantize(to_buy),
        fully_covered=to_buy == _ZERO,
        has_unmeasured_items=unmeasured,
        base_unit=product.base_unit,
    )


def user_pantry(session: Session, user_id: uuid.UUID) -> list[PantryItem]:
    """A despensa de um usuário, do item mais recente ao mais antigo."""
    return list(
        session.scalars(
            select(PantryItem)
            .where(PantryItem.user_id == user_id)
            .order_by(PantryItem.created_at.desc())
        ).all()
    )


def suggest_products(session: Session, pantry_item: PantryItem) -> list[ScoredProduct]:
    """Produtos do catálogo parecidos com o que a pessoa digitou.

    Só sugere: quem confirma qual é o produto é o usuário, como no casamento do
    item do plano. Enquanto não confirma, `product_id` fica nulo e o item não
    abate nada da lista.
    """
    catalog = session.scalars(select(Product)).all()
    return rank_products(pantry_item.raw_description, catalog)
