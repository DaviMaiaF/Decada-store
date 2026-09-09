"""Schemas do plano alimentar: import, consulta e confirmação do casamento."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import MeasurementUnit, PlanItemStatus
from app.schemas.common import ApiModel, ProductOut


class PlanItemOut(ApiModel):
    """Item prescrito, com o resultado do casamento."""

    id: uuid.UUID
    position: int
    raw_description: str
    quantity: Decimal
    unit: MeasurementUnit
    status: PlanItemStatus
    # Nulo até o usuário confirmar qual produto atende ao item.
    product_id: uuid.UUID | None = None
    match_score: Decimal | None = None


class MealPlanOut(ApiModel):
    id: uuid.UUID
    title: str | None = None
    nutritionist_name: str | None = None
    consent_at: datetime
    consent_version: str
    created_at: datetime
    items: list[PlanItemOut]


class DiscardedLineOut(ApiModel):
    """Linha do PDF que não virou item, e por quê."""

    text: str
    reason: str


class ImportResultOut(ApiModel):
    """O que o PDF rendeu.

    `discarded` existe para a tela poder mostrar o que foi ignorado. Sem isso o
    usuário não teria como perceber uma linha lida errado.
    """

    meal_plan: MealPlanOut
    items_created: int
    items_matched: int
    items_unidentified: int
    discarded: list[DiscardedLineOut]


class CandidateOut(ApiModel):
    """Produto que pode atender ao item, com o quanto se parece."""

    product: ProductOut
    score: Decimal
    # False quando a unidade do plano é de outra grandeza que a do produto.
    unit_compatible: bool
    quantity_in_base: Decimal | None = None
    packages_needed: int | None = None


class ConfirmationIn(BaseModel):
    """Escolha do usuário para um item do plano."""

    product_id: uuid.UUID
    # Score do candidato escolhido, para a decisão continuar rastreável.
    match_score: Decimal | None = Field(default=None, ge=0, le=1)
