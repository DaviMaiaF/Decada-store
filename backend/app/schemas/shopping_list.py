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
    # Item que a pessoa acrescentou, e não veio do plano. É o que diz à tela
    # que aquilo pode ser removido e que não é prescrição.
    is_extra: bool = False
    packages_needed: int | None = None
    match_score: Decimal | None = None

    estimated_cost: Decimal | None = None
    unit_price_snapshot: Decimal | None = None
    price_reference_date: datetime | None = None
    price_origin: PriceOrigin | None = None
    price_confidence: PriceConfidence | None = None
    price_sample_size: int | None = None

    # Quem exibe conta quantos faltam: o servidor devolve o fato de cada item,
    # não o agregado. Mesmo critério do agrupamento por corredor.
    purchased: bool = False
    purchased_at: datetime | None = None
    # O que a despensa poupou neste item. Nulo quando não há preço; zero quando
    # o que havia em casa não chegou a tirar uma embalagem do carrinho.
    pantry_savings: Decimal | None = None


class ExtraItemIn(BaseModel):
    """Produto que a pessoa acrescenta à compra, fora da prescrição.

    Quantidade e unidade são obrigatórias: sem elas não há o que precificar, e
    inventar "uma embalagem" seria o servidor decidindo quanto alguém compra.
    A tela já sabe sugerir a embalagem do produto, como faz na despensa.
    """

    product_id: uuid.UUID
    quantity: Decimal = Field(gt=0)
    unit: MeasurementUnit


class PurchaseIn(BaseModel):
    """Marcar ou desmarcar um item dentro do mercado."""

    purchased: bool


class ShoppingListOut(ApiModel):
    id: uuid.UUID
    meal_plan_id: uuid.UUID
    state_code: str
    city: str
    estimated_total: Decimal | None = None
    calculated_at: datetime | None = None
    items: list[ShoppingListItemOut]


class SimulationItemIn(BaseModel):
    """Uma quantidade hipotética para um item da lista."""

    item_id: uuid.UUID
    quantity: Decimal = Field(gt=0)


class SimulationIn(BaseModel):
    """O cenário inteiro que se quer simular.

    Só os itens que mudaram precisam vir: o que não está aqui continua como está
    na lista salva.
    """

    items: list[SimulationItemIn] = Field(min_length=1, max_length=200)


class SimulatedItemOut(ApiModel):
    """O item sob a quantidade hipotética. Nada disso foi gravado."""

    item_id: uuid.UUID
    quantity: Decimal
    quantity_charged: Decimal
    packages_needed: int | None = None
    estimated_cost: Decimal | None = None


class ShoppingListSummaryOut(ApiModel):
    """Lista de compras na listagem, sem os itens.

    Mesma razão da listagem de planos: serve para o app reencontrar a lista
    depois de ser fechado, e os itens vêm depois, por `GET /shopping-lists/{id}`.
    """

    id: uuid.UUID
    meal_plan_id: uuid.UUID
    state_code: str
    city: str
    estimated_total: Decimal | None = None
    calculated_at: datetime | None = None
    created_at: datetime


class GeneratedListOut(ApiModel):
    """A lista recém-gerada e o resumo do que aconteceu com o plano."""

    shopping_list: ShoppingListOut
    items_to_buy: int
    items_dispensed: int
    # Itens do plano que ficaram de fora por não terem produto confirmado.
    items_skipped: int
    items_priced: int
    items_without_price: int
    # Quanto a despensa poupou na lista inteira.
    pantry_savings: Decimal
    # O pior selo entre os itens precificados.
    lowest_confidence: PriceConfidence | None = None
