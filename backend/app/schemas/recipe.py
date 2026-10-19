"""Schemas das receitas."""

import uuid
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.models.enums import MeasurementUnit
from app.schemas.common import ApiModel, ProductOut


class RecipeIngredientIn(BaseModel):
    product_id: uuid.UUID
    # Mesma precisão da coluna: Numeric(12, 3).
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    unit: MeasurementUnit
    optional: bool = False


class RecipeIn(BaseModel):
    """Receita como a nutricionista a escreve. Serve para criar e para editar.

    Editar manda a receita inteira de novo, ingredientes inclusive: é o que o
    editor da tela tem em mãos, e evita um PATCH por ingrediente.
    """

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
    instructions: str | None = Field(default=None, max_length=10_000)
    servings: int | None = Field(default=None, ge=1, le=100)
    prep_minutes: int | None = Field(default=None, ge=1, le=24 * 60)
    ingredients: list[RecipeIngredientIn] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def ingredientes_coerentes(self) -> "RecipeIn":
        produtos = [ingrediente.product_id for ingrediente in self.ingredients]
        # O banco também recusa, mas aqui a resposta é 422 com motivo, não 500.
        if len(produtos) != len(set(produtos)):
            raise ValueError("o mesmo produto aparece duas vezes nos ingredientes")
        # Receita só de opcionais seria sempre 100% disponível e sugerida a
        # todo mundo, o que não diz nada a ninguém.
        if all(ingrediente.optional for ingrediente in self.ingredients):
            raise ValueError("a receita precisa de ao menos um ingrediente obrigatório")
        return self


class RecipeAuthorOut(ApiModel):
    """Quem assina a receita. Só o que identifica a profissional, nunca o e-mail."""

    full_name: str | None = None
    crn: str | None = None


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
    # Nula nas receitas do seed.
    author: RecipeAuthorOut | None = None
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
