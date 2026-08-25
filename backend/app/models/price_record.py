"""Registro de preço de um produto, em um mercado, em uma data."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, pg_enum
from app.models.enums import MeasurementUnit, PriceOrigin

if TYPE_CHECKING:
    from app.models.market import Market
    from app.models.product import Product


class PriceRecord(UUIDPrimaryKeyMixin, Base):
    """Fato histórico e imutável: por isso não tem `updated_at`."""

    __tablename__ = "price_records"
    __table_args__ = (
        Index(
            "ix_price_records_produto_regiao_data",
            "product_id",
            "state_code",
            "city",
            "collected_at",
        ),
        # Impede importar duas vezes o mesmo produto da mesma nota fiscal.
        # Registros sem chave (seed, scraping) têm nfce_access_key nulo e o
        # Postgres não os considera duplicados — que é o comportamento desejado.
        UniqueConstraint("nfce_access_key", "product_id", name="uq_price_records_nota_produto"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    market_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("markets.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Quem contribuiu com o preço. SET NULL na exclusão da conta: o preço
    # sobrevive anonimizado (requisito da etapa 9).
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    # Valor como aparece no cupom, na unidade do cupom.
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unit: Mapped[MeasurementUnit] = mapped_column(
        pg_enum(MeasurementUnit, "measurement_unit"),
        nullable=False,
    )
    # Mesmo valor convertido para a unidade base do produto (R$/kg, R$/l, R$/un).
    # Gravado na escrita para que média, mediana e desvio (etapa 4) sejam uma
    # agregação direta, sem converter linha a linha na consulta.
    price_per_base_unit: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)

    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    origin: Mapped[PriceOrigin] = mapped_column(
        pg_enum(PriceOrigin, "price_origin"),
        nullable=False,
    )
    # Região duplicada de propósito: é a região no momento da compra e não deve
    # mudar retroativamente se o cadastro do mercado for corrigido.
    state_code: Mapped[str] = mapped_column(String(2), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    # Chave de acesso da NFC-e (44 dígitos), quando a origem é `nfce`.
    nfce_access_key: Mapped[str | None] = mapped_column(String(44))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    product: Mapped["Product"] = relationship(back_populates="price_records")
    market: Mapped["Market"] = relationship(back_populates="price_records")
