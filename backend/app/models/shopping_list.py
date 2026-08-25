"""Lista de compras gerada a partir de um plano alimentar."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum
from app.models.enums import MeasurementUnit, PriceConfidence, PriceOrigin

if TYPE_CHECKING:
    from app.models.meal_plan import MealPlan, PlanItem
    from app.models.product import Product


class ShoppingList(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "shopping_lists"

    meal_plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("meal_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Região usada no cálculo: a média de preço é sempre regional, nunca nacional.
    state_code: Mapped[str] = mapped_column(String(2), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    estimated_total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    calculated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    meal_plan: Mapped["MealPlan"] = relationship(back_populates="shopping_lists")
    items: Mapped[list["ShoppingListItem"]] = relationship(
        back_populates="shopping_list", cascade="all, delete-orphan"
    )


class ShoppingListItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Produto escolhido pelo usuário para atender a um item do plano.

    Os campos de preço são um retrato do momento em que a lista foi gerada.
    Sem esse congelamento a lista mudaria de valor a cada consulta e o custo
    apresentado não seria reproduzível.
    """

    __tablename__ = "shopping_list_items"
    __table_args__ = (
        UniqueConstraint(
            "shopping_list_id", "plan_item_id", name="uq_shopping_list_items_lista_item"
        ),
    )

    shopping_list_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("shopping_lists.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("plan_items.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )

    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit: Mapped[MeasurementUnit] = mapped_column(
        pg_enum(MeasurementUnit, "measurement_unit"),
        nullable=False,
    )
    # Quantas embalagens comprar para cobrir a quantidade prescrita.
    packages_needed: Mapped[int | None] = mapped_column(Integer)
    # Score do casamento que o usuário confirmou — mantém a escolha rastreável.
    match_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))

    # --- Retrato do preço no momento da geração ---
    unit_price_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    price_reference_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    price_origin: Mapped[PriceOrigin | None] = mapped_column(
        pg_enum(PriceOrigin, "price_origin")
    )
    price_confidence: Mapped[PriceConfidence | None] = mapped_column(
        pg_enum(PriceConfidence, "price_confidence")
    )
    price_sample_size: Mapped[int | None] = mapped_column(Integer)
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    shopping_list: Mapped["ShoppingList"] = relationship(back_populates="items")
    plan_item: Mapped["PlanItem"] = relationship()
    product: Mapped["Product"] = relationship()
