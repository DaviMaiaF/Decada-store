"""Despensa: o que o usuário já tem em casa."""

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum
from app.models.enums import MeasurementUnit

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.user import User


class PantryItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Item que já está em casa e por isso não precisa ser comprado de novo.

    Pertence ao usuário, não ao plano alimentar: trocar de prescrição não
    esvazia a despensa.
    """

    __tablename__ = "pantry_items"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Exatamente como a pessoa digitou: "aveia em flocos finos (aberto)".
    raw_description: Mapped[str] = mapped_column(Text, nullable=False)
    # Preenchido a partir do texto acima; é o que permite buscar na despensa
    # sem depender de acento nem de caixa.
    normalized_description: Mapped[str | None] = mapped_column(String(255), index=True)
    # Nulo enquanto o usuário não confirma com qual produto do catálogo o item
    # se parece. Sem produto não há unidade base, e sem unidade base não há
    # como abater da lista de compras.
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), index=True
    )
    # Quantidade é opcional: "tenho azeite em casa" é informação verdadeira e
    # útil sem número. O que ela não é, é abatível — ver services/pantry.py.
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    unit: Mapped[MeasurementUnit | None] = mapped_column(
        pg_enum(MeasurementUnit, "measurement_unit")
    )

    user: Mapped["User"] = relationship(back_populates="pantry_items")
    product: Mapped["Product | None"] = relationship()
