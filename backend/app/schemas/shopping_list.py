"""Schemas da lista de compras."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import MeasurementUnit, PriceConfidence, PriceOrigin
from app.schemas.common import ApiModel, ProductOut


class GenerateListIn(BaseModel):
    """Região da compra. A média de preço é sempre regional, nunca nacional."""

    state_code: str = Field(min_length=2, max_length=2)
    city: str = Field(min_length=1, max_length=120)


class ShoppingListItemOut(ApiModel):
    """Item da lista, com o retrato do preço no momento em que ela foi gerada.

    Preço nunca viaja sozinho: `price_reference_date`, `price_origin` e
    `price_confidence` acompanham o valor para a tela poder dizer de quando ele
    é e de onde veio.
    """

    id: uuid.UUID
    product: ProductOut
    # Já descontado o que havia na despensa. Zero significa dispensado.
    quantity: Decimal
    unit: MeasurementUnit
    quantity_from_pantry: Decimal
    dispensed_by_pantry: bool
    packages_needed: int | None = None
    match_score: Decimal | None = None

    estimated_cost: Decimal | None = None
    unit_price_snapshot: Decimal | None = None
    price_reference_date: datetime | None = None
    price_origin: PriceOrigin | None = None
    price_confidence: PriceConfidence | None = None
    price_sample_size: int | None = None


class ShoppingListOut(ApiModel):
    id: uuid.UUID
    meal_plan_id: uuid.UUID
    state_code: str
    city: str
    estimated_total: Decimal | None = None
    calculated_at: datetime | None = None
    items: list[ShoppingListItemOut]


class GeneratedListOut(ApiModel):
    """A lista recém-gerada e o resumo do que aconteceu com o plano."""

    shopping_list: ShoppingListOut
    items_to_buy: int
    items_dispensed: int
    # Itens do plano que ficaram de fora por não terem produto confirmado.
    items_skipped: int
    items_priced: int
    items_without_price: int
    # O pior selo entre os itens precificados.
    lowest_confidence: PriceConfidence | None = None
