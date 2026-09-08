"""Cálculo de preço a partir dos registros coletados.

Duas responsabilidades: agregar os preços de um produto numa região e calcular
o custo de uma lista de compras. A agregação é uma função pura sobre amostras;
só o custo da lista precisa do banco.

Regras que este módulo faz valer:
  - todo preço é comparado na unidade base do produto (R$/kg, R$/l, R$/unidade);
  - nenhum número é devolvido sem data, origem e tamanho da amostra;
  - menos de 3 amostras na região devolve a média, porém sinalizada;
  - região sem coleta não vale zero: vale ausência de preço.
"""

import statistics
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PriceRecord, Product, ShoppingList
from app.models.enums import BaseUnit, PriceConfidence, PriceOrigin
from app.services.units import IncompatibleUnitError, to_base_quantity

# Faixas de confiança pela idade da coleta mais recente.
CURRENT_MAX_DAYS = 7
RECENT_MAX_DAYS = 30

# Abaixo disto a média é devolvida, mas marcada como pouco confiável.
MINIMUM_SAMPLES = 3

_PRICE_PRECISION = Decimal("0.0001")
_MONEY = Decimal("0.01")

# Da mais confiável para a menos.
_CONFIDENCE_ORDER = (
    PriceConfidence.ATUAL,
    PriceConfidence.RECENTE,
    PriceConfidence.ESTIMATIVA,
)


@dataclass(frozen=True)
class PriceSample:
    """Um registro de preço já normalizado para a unidade base."""

    price_per_base_unit: Decimal
    collected_at: datetime
    origin: PriceOrigin


@dataclass(frozen=True)
class PriceAggregate:
    """Preço de um produto numa região, com tudo que o número precisa carregar."""

    average: Decimal
    median: Decimal
    # None com uma amostra só: desvio de um número não existe.
    stddev: Decimal | None
    minimum: Decimal
    maximum: Decimal
    base_unit: BaseUnit
    latest_collected_at: datetime
    # Origem da coleta mais recente — é a que cabe no snapshot da lista.
    latest_origin: PriceOrigin
    # Todas as origens que formaram a média.
    origins: frozenset[PriceOrigin]
    sample_size: int
    confidence: PriceConfidence
    low_sample: bool


@dataclass(frozen=True)
class ShoppingListCost:
    total: Decimal
    items_priced: int
    items_without_price: int
    # O pior selo entre os itens precificados; None se nenhum tem preço.
    lowest_confidence: PriceConfidence | None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def classify_confidence(
    collected_at: datetime, *, reference: datetime | None = None
) -> PriceConfidence:
    """Classifica um preço pela idade: atual até 7 dias, recente até 30, depois estimativa."""
    days = ((reference or _now()) - collected_at).days

    if days <= CURRENT_MAX_DAYS:
        return PriceConfidence.ATUAL
    if days <= RECENT_MAX_DAYS:
        return PriceConfidence.RECENTE
    return PriceConfidence.ESTIMATIVA


def aggregate_prices(
    samples: Sequence[PriceSample],
    base_unit: BaseUnit,
    *,
    reference: datetime | None = None,
) -> PriceAggregate | None:
    """Agrega as amostras de uma região. Devolve None quando não há nenhuma."""
    if not samples:
        return None

    values = [sample.price_per_base_unit for sample in samples]
    latest = max(samples, key=lambda sample: sample.collected_at)

    stddev = None
    if len(values) > 1:
        stddev = Decimal(statistics.stdev(values)).quantize(_PRICE_PRECISION, ROUND_HALF_UP)

    return PriceAggregate(
        average=Decimal(statistics.fmean(values)).quantize(_PRICE_PRECISION, ROUND_HALF_UP),
        median=Decimal(statistics.median(values)).quantize(_PRICE_PRECISION, ROUND_HALF_UP),
        stddev=stddev,
        minimum=min(values).quantize(_PRICE_PRECISION, ROUND_HALF_UP),
        maximum=max(values).quantize(_PRICE_PRECISION, ROUND_HALF_UP),
        base_unit=base_unit,
        latest_collected_at=latest.collected_at,
        latest_origin=latest.origin,
        origins=frozenset(sample.origin for sample in samples),
        sample_size=len(values),
        confidence=classify_confidence(latest.collected_at, reference=reference),
        low_sample=len(values) < MINIMUM_SAMPLES,
    )


def product_price(
    session: Session,
    product: Product,
    state_code: str,
    city: str,
    *,
    reference: datetime | None = None,
) -> PriceAggregate | None:
    """Preço agregado de um produto numa região.

    A média é sempre regional: a região entra na consulta, nunca é ignorada.
    """
    records = session.scalars(
        select(PriceRecord).where(
            PriceRecord.product_id == product.id,
            PriceRecord.state_code == state_code,
            PriceRecord.city == city,
        )
    ).all()

    samples = [
        PriceSample(
            price_per_base_unit=record.price_per_base_unit,
            collected_at=record.collected_at,
            origin=record.origin,
        )
        for record in records
    ]
    return aggregate_prices(samples, product.base_unit, reference=reference)


def _quantity_to_charge(quantity_in_base: Decimal, product: Product) -> tuple[Decimal, int | None]:
    """Quanto de fato se leva do mercado.

    Produto embalado cobra a embalagem fechada: quem precisa de 300 g de um
    queijo vendido em pacote de 500 g paga o pacote inteiro. A granel, cobra-se
    a quantidade pedida.
    """
    if product.package_size is None or product.package_unit is None:
        return quantity_in_base, None

    package_in_base = to_base_quantity(
        product.package_size, product.package_unit, product.base_unit
    )
    packages_needed = int(
        (quantity_in_base / package_in_base).to_integral_value(rounding=ROUND_CEILING)
    )
    return package_in_base * packages_needed, packages_needed


def price_shopping_list(
    session: Session, shopping_list: ShoppingList, *, reference: datetime | None = None
) -> ShoppingListCost:
    """Precifica a lista, grava o retrato do preço em cada item e devolve o total.

    Quem chama decide quando confirmar a transação.
    """
    total = Decimal("0.00")
    priced = 0
    without_price = 0
    confidences: list[PriceConfidence] = []

    for item in shopping_list.items:
        aggregate = product_price(
            session,
            item.product,
            shopping_list.state_code,
            shopping_list.city,
            reference=reference,
        )

        if aggregate is None:
            # Sem preço na região o item fica sem custo. Zero seria mentira.
            item.unit_price_snapshot = None
            item.price_reference_date = None
            item.price_origin = None
            item.price_confidence = None
            item.price_sample_size = None
            item.estimated_cost = None
            without_price += 1
            continue

        try:
            quantity_in_base = to_base_quantity(item.quantity, item.unit, item.product.base_unit)
        except IncompatibleUnitError:
            # Unidade do item não bate com a do produto: não há custo a calcular.
            item.estimated_cost = None
            without_price += 1
            continue

        quantity_charged, packages_needed = _quantity_to_charge(quantity_in_base, item.product)
        cost = (aggregate.average * quantity_charged).quantize(_MONEY, ROUND_HALF_UP)

        item.packages_needed = packages_needed
        item.unit_price_snapshot = aggregate.average
        item.price_reference_date = aggregate.latest_collected_at
        item.price_origin = aggregate.latest_origin
        item.price_confidence = aggregate.confidence
        item.price_sample_size = aggregate.sample_size
        item.estimated_cost = cost

        total += cost
        priced += 1
        confidences.append(aggregate.confidence)

    shopping_list.estimated_total = total
    shopping_list.calculated_at = reference or _now()

    lowest = None
    if confidences:
        lowest = max(confidences, key=_CONFIDENCE_ORDER.index)

    return ShoppingListCost(
        total=total,
        items_priced=priced,
        items_without_price=without_price,
        lowest_confidence=lowest,
    )
