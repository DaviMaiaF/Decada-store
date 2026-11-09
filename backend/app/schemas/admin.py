"""Schemas do painel do super usuário.

**Nenhum deles carrega conteúdo de saúde** (decisão 15). Da conta saem identificação
e contagens; do sistema, só números agregados. Título de plano, item, despensa e
lista de compras não têm campo aqui, e um teste confere isso.
"""

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import AdminActionType, UserRole
from app.schemas.common import ApiModel


class WeeklySignupsOut(BaseModel):
    week_start: date
    count: int


class AccountMetricsOut(BaseModel):
    total: int
    suspended: int
    by_role: dict[str, int]
    signups_by_week: list[WeeklySignupsOut]


class StatusMetricsOut(BaseModel):
    total: int
    by_status: dict[str, int]


class RegionPricesOut(BaseModel):
    state_code: str
    city: str
    total: int
    stale: int


class PriceMetricsOut(BaseModel):
    total: int
    # Mais de 30 dias: o app exibe como estimativa (decisão 1).
    stale: int
    by_origin: dict[str, int]
    by_region: list[RegionPricesOut]


class CatalogMetricsOut(BaseModel):
    products: int
    markets: int
    recipes: int


class DashboardOut(BaseModel):
    generated_at: datetime
    accounts: AccountMetricsOut
    meal_plans: int
    shopping_lists: int
    prescriptions: StatusMetricsOut
    payments: StatusMetricsOut
    prices: PriceMetricsOut
    catalog: CatalogMetricsOut


class AdminAccountOut(ApiModel):
    id: uuid.UUID
    email: str
    full_name: str | None = None
    role: UserRole
    created_at: datetime
    suspended_at: datetime | None = None
    meal_plans_count: int
    prescriptions_count: int


class AdminAccountPageOut(BaseModel):
    total: int
    items: list[AdminAccountOut]


class AdminActionOut(BaseModel):
    id: uuid.UUID
    action: AdminActionType
    target_role: UserRole
    created_at: datetime
    # Nulo quando a conta já não existe: é a exclusão funcionando (decisão 9).
    actor_email: str | None = None
    target_email: str | None = None


class AdminActionPageOut(BaseModel):
    total: int
    items: list[AdminActionOut]
