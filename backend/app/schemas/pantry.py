"""Schemas da despensa."""

import uuid
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import MeasurementUnit
from app.schemas.common import ApiModel, ProductOut


class PantryItemIn(BaseModel):
    """Item que a pessoa diz ter em casa.

    Quantidade e produto são opcionais: "tenho azeite" é informação válida sem
    número e sem catálogo.
    """

    raw_description: str = Field(min_length=1, max_length=500)
    product_id: uuid.UUID | None = None
    quantity: Decimal | None = Field(default=None, gt=0)
    unit: MeasurementUnit | None = None

    @model_validator(mode="after")
    def quantidade_e_unidade_andam_juntas(self) -> "PantryItemIn":
        # Quantidade sem unidade não diz nada, e unidade sem quantidade também
        # não. Aceitar o par pela metade produziria item que nunca abate.
        if (self.quantity is None) != (self.unit is None):
            raise ValueError("quantidade e unidade precisam ser informadas juntas")
        return self


class ProductSuggestionOut(ApiModel):
    """Produto parecido com o texto que a pessoa digitou.

    Sem conversão de quantidade, ao contrário do candidato de item do plano: o
    item da despensa pode não ter quantidade nenhuma.
    """

    product: ProductOut
    score: Decimal


class PantryItemOut(ApiModel):
    id: uuid.UUID
    raw_description: str
    product: ProductOut | None = None
    quantity: Decimal | None = None
    unit: MeasurementUnit | None = None
