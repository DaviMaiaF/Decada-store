"""Usuário do aplicativo."""

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.meal_plan import MealPlan


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    # Nulo até a etapa 9 (autenticação): usuários criados em desenvolvimento
    # ainda não têm senha. Passa a ser obrigatório quando o login existir.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    full_name: Mapped[str | None] = mapped_column(String(255))

    meal_plans: Mapped[list["MealPlan"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
