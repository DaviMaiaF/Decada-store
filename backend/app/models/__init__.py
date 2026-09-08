"""Modelos da DÉCADA.

Todos são importados aqui para que o Alembic enxergue o metadata completo
ao gerar migrações automaticamente.
"""

from app.models.base import Base
from app.models.enums import (
    BaseUnit,
    MeasurementUnit,
    PlanItemStatus,
    PriceConfidence,
    PriceOrigin,
)
from app.models.market import Market
from app.models.meal_plan import MealPlan, PlanItem
from app.models.price_record import PriceRecord
from app.models.product import Product
from app.models.recipe import Recipe, RecipeIngredient
from app.models.shopping_list import ShoppingList, ShoppingListItem
from app.models.user import User

__all__ = [
    "Base",
    "BaseUnit",
    "Market",
    "MealPlan",
    "MeasurementUnit",
    "PlanItem",
    "PlanItemStatus",
    "PriceConfidence",
    "PriceOrigin",
    "PriceRecord",
    "Product",
    "Recipe",
    "RecipeIngredient",
    "ShoppingList",
    "ShoppingListItem",
    "User",
]
