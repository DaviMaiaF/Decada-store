"""Usuário do aplicativo."""

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum
from app.models.enums import UserRole

if TYPE_CHECKING:
    from app.models.meal_plan import MealPlan
    from app.models.pantry import PantryItem


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        # Nutricionista sem CRN não deveria existir: é o registro que diz quem
        # escreveu a receita que o paciente vai ler.
        CheckConstraint(
            "role <> 'nutricionista' OR crn IS NOT NULL",
            name="nutricionista_com_crn",
        ),
    )

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    # Hash bcrypt, nunca a senha. Obrigatório desde a etapa 10: usuário sem
    # senha não conseguiria entrar, então não deveria existir.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    # Um papel por conta. Quem é paciente e nutricionista ao mesmo tempo tem
    # duas contas: misturar o plano alimentar da pessoa com o trabalho dela
    # deixaria a exclusão de uma das metades sem resposta clara.
    role: Mapped[UserRole] = mapped_column(
        pg_enum(UserRole, "user_role"),
        nullable=False,
        default=UserRole.PACIENTE,
        server_default=UserRole.PACIENTE.value,
    )
    # Declarado no cadastro e não verificado, como o CRN do plano: o formato
    # varia por região ("CRN-3 48291") e não há consulta pública ao conselho
    # que o MVP possa usar.
    crn: Mapped[str | None] = mapped_column(String(50))

    meal_plans: Mapped[list["MealPlan"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    pantry_items: Mapped[list["PantryItem"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
