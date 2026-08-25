"""Receitas e seus ingredientes."""

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum
from app.models.enums import MeasurementUnit

if TYPE_CHECKING:
    from app.models.product import Product


class Recipe(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "recipes"

    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text)
    servings: Mapped[int | None] = mapped_column(Integer)
    prep_minutes: Mapped[int | None] = mapped_column(Integer)
    is_fictitious: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="recipe", cascade="all, delete-orphan"
    )


class RecipeIngredient(UUIDPrimaryKeyMixin, Base):
    """Ingrediente apontando direto para um produto do catálogo.

    É o que permite responder "a lista contém todos os ingredientes?" (etapa 7)
    com uma comparação de conjuntos de IDs, sem passar pelo casamento textual.
    """

    __tablename__ = "recipe_ingredients"
    __table_args__ = (
        UniqueConstraint("recipe_id", "product_id", name="uq_recipe_ingredients_receita_produto"),
    )

    recipe_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit: Mapped[MeasurementUnit] = mapped_column(
        pg_enum(MeasurementUnit, "measurement_unit"),
        nullable=False,
    )
    # Ingrediente opcional não impede a receita de ser sugerida.
    optional: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    recipe: Mapped["Recipe"] = relationship(back_populates="ingredients")
    product: Mapped["Product"] = relationship()
