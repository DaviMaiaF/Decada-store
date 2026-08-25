"""Produto real de supermercado."""

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum
from app.models.enums import BaseUnit, MeasurementUnit

if TYPE_CHECKING:
    from app.models.price_record import PriceRecord


class Product(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "products"

    # Identificador estável derivado de nome + marca + gramatura.
    # É o que torna o seed idempotente (etapa 2).
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Sem acento, minúsculo, sem stopwords — é sobre esta coluna que o
    # casamento por similaridade trabalha (etapa 3).
    normalized_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    brand: Mapped[str | None] = mapped_column(String(120))
    # Gramatura da embalagem: 500 (g), 1 (l), 12 (unidade).
    package_size: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    package_unit: Mapped[MeasurementUnit | None] = mapped_column(
        pg_enum(MeasurementUnit, "measurement_unit")
    )
    # Unidade em que o preço deste produto é comparado: R$/kg, R$/l ou R$/unidade.
    base_unit: Mapped[BaseUnit] = mapped_column(
        pg_enum(BaseUnit, "base_unit"),
        nullable=False,
    )
    barcode: Mapped[str | None] = mapped_column(String(14), unique=True)
    category: Mapped[str | None] = mapped_column(String(60), index=True)
    # Marca dado de desenvolvimento. Produto fictício nunca deve ir para produção.
    is_fictitious: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    price_records: Mapped[list["PriceRecord"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
