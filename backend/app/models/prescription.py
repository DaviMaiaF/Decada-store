"""Plano alimentar montado pela nutricionista, antes de chegar ao paciente."""

import uuid
from datetime import datetime, time
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum
from app.models.enums import MeasurementUnit, PrescriptionStatus

if TYPE_CHECKING:
    from app.models.user import User


class Prescription(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """O documento da nutricionista, como o PDF que ela entregaria.

    Não é o `MealPlan` do paciente. O paciente só passa a ter um plano quando
    aceita este, com consentimento (decisão 5), e o que ele recebe é uma cópia:
    a nutricionista excluir a conta dela não pode fazer comida sumir da dieta
    de alguém.
    """

    __tablename__ = "prescriptions"

    # CASCADE: o documento é trabalho da nutricionista e sai junto com a conta
    # dela (decisão 9). A cópia que o paciente aceitou não depende desta linha.
    author_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String(255))
    # Como sai no cabeçalho do PDF. Não liga a conta nenhuma.
    patient_name: Mapped[str | None] = mapped_column(String(255))
    # Para quem foi enviado. Nulo enquanto é rascunho. Não é chave estrangeira
    # de propósito: o envio funciona igual exista conta com o e-mail ou não
    # (decisão 10), e a pessoa pode criar a conta depois.
    patient_email: Mapped[str | None] = mapped_column(String(255), index=True)
    # Orientação geral, fora de qualquer refeição.
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[PrescriptionStatus] = mapped_column(
        pg_enum(PrescriptionStatus, "prescription_status"),
        nullable=False,
        default=PrescriptionStatus.RASCUNHO,
        server_default=PrescriptionStatus.RASCUNHO.value,
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    author: Mapped["User"] = relationship()
    meals: Mapped[list["PrescriptionMeal"]] = relationship(
        back_populates="prescription",
        cascade="all, delete-orphan",
        order_by="PrescriptionMeal.position",
    )


class PrescriptionMeal(UUIDPrimaryKeyMixin, Base):
    """Refeição do plano: "08:30 - Café da manhã"."""

    __tablename__ = "prescription_meals"
    __table_args__ = (
        UniqueConstraint("prescription_id", "position", name="uq_prescription_meals_plano_ordem"),
    )

    prescription_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("prescriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    # Obrigatório: é o horário que faz o import reconhecer a linha como
    # cabeçalho de refeição no PDF gerado, qualquer que seja o nome.
    time: Mapped[time] = mapped_column(Time, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    prescription: Mapped["Prescription"] = relationship(back_populates="meals")
    items: Mapped[list["PrescriptionItem"]] = relationship(
        back_populates="meal",
        cascade="all, delete-orphan",
        order_by="(PrescriptionItem.option, PrescriptionItem.position)",
    )


class PrescriptionItem(UUIDPrimaryKeyMixin, Base):
    """Alimento de uma refeição: "Arroz branco cozido - 6 colheres de sopa - 150 g".

    `option` 0 é o que se come; 1, 2… são as substituições que a nutricionista
    ofereceu para a refeição inteira (decisão 8). Só a opção 0 vai para a lista
    de compras — as outras o paciente lê.
    """

    __tablename__ = "prescription_items"
    __table_args__ = (
        UniqueConstraint(
            "meal_id", "option", "position", name="uq_prescription_items_refeicao_opcao_ordem"
        ),
    )

    meal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("prescription_meals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    option: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    food: Mapped[str] = mapped_column(String(45), nullable=False)
    # Como se mede em casa: "6 colheres de sopa cheia". Informativo.
    household_measure: Mapped[str | None] = mapped_column(String(25))
    # A quantidade de compra, que é o que vira item do plano do paciente.
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit: Mapped[MeasurementUnit] = mapped_column(
        pg_enum(MeasurementUnit, "measurement_unit"), nullable=False
    )

    meal: Mapped["PrescriptionMeal"] = relationship(back_populates="items")
