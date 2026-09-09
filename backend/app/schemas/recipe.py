"""Schemas das receitas."""

import uuid
from decimal import Decimal

from app.models.enums import MeasurementUnit
from app.schemas.common import ApiModel, ProductOut


class RecipeIngredientOut(ApiModel):
    product: ProductOut
    quantity: Decimal
    unit: MeasurementUnit
    optional: bool


class RecipeOut(ApiModel):
    id: uuid.UUID
    slug: str
    name: str
    servings: int | None = None
    prep_minutes: int | None = None
    instructions: str | None = None
    is_fictitious: bool
    ingredients: list[RecipeIngredientOut]


class RecipeAvailabilityOut(ApiModel):
    """O quanto a receita já está coberta pela despensa somada à lista de compras."""

    recipe: RecipeOut
    # Proporção de ingredientes obrigatórios disponíveis, de 0 a 100.
    percentage: int
    complete: bool
    required_total: int
    required_available: int
    # Obrigatórios que faltam — é o "falta chia" da tela.
    missing: list[RecipeIngredientOut]
    missing_optional: list[RecipeIngredientOut]
