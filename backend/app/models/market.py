"""Mercado onde um preço foi coletado."""

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.price_record import PriceRecord


class Market(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "markets"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Vem da NFC-e. Nulo em mercados fictícios do seed.
    cnpj: Mapped[str | None] = mapped_column(String(14), unique=True)
    chain: Mapped[str | None] = mapped_column(String(120))
    state_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    city: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    is_fictitious: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    price_records: Mapped[list["PriceRecord"]] = relationship(back_populates="market")
