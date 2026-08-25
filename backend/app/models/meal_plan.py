"""Plano alimentar prescrito e seus itens."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum
from app.models.enums import MeasurementUnit, PlanItemStatus

if TYPE_CHECKING:
    from app.models.shopping_list import ShoppingList
    from app.models.user import User


class MealPlan(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Prescrição de uma nutricionista. Dado pessoal sensível de saúde (LGPD)."""

    __tablename__ = "meal_plans"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String(255))
    # Texto livre original enviado pelo usuário, preservado para auditoria.
    source_text: Mapped[str | None] = mapped_column(Text)
    nutritionist_name: Mapped[str | None] = mapped_column(String(255))
    # Consentimento explícito: sem data e versão do termo o plano não pode existir.
    consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consent_version: Mapped[str] = mapped_column(String(50), nullable=False)

    user: Mapped["User"] = relationship(back_populates="meal_plans")
    items: Mapped[list["PlanItem"]] = relationship(
        back_populates="meal_plan",
        cascade="all, delete-orphan",
        order_by="PlanItem.position",
    )
    shopping_lists: Mapped[list["ShoppingList"]] = relationship(
        back_populates="meal_plan", cascade="all, delete-orphan"
    )


class PlanItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Item prescrito: descrição textual original, quantidade e unidade."""

    __tablename__ = "plan_items"
    __table_args__ = (
        UniqueConstraint("meal_plan_id", "position", name="uq_plan_items_plano_ordem"),
    )

    meal_plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("meal_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    # Exatamente como veio do plano: "1,2 kg de peito de frango sem pele".
    raw_description: Mapped[str] = mapped_column(Text, nullable=False)
    # Preenchido pelo serviço de casamento (etapa 3).
    normalized_description: Mapped[str | None] = mapped_column(String(255))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit: Mapped[MeasurementUnit] = mapped_column(
        pg_enum(MeasurementUnit, "measurement_unit"),
        nullable=False,
    )
    status: Mapped[PlanItemStatus] = mapped_column(
        pg_enum(PlanItemStatus, "plan_item_status"),
        nullable=False,
        default=PlanItemStatus.PENDENTE,
        server_default=PlanItemStatus.PENDENTE.value,
    )

    meal_plan: Mapped["MealPlan"] = relationship(back_populates="items")
