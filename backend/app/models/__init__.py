"""Modelos da DÉCADA.

Todos são importados aqui para que o Alembic enxergue o metadata completo
ao gerar migrações automaticamente.
"""

from app.models.admin_action import AdminAction
from app.models.base import Base
from app.models.enums import (
    AdminActionType,
    BaseUnit,
    MeasurementUnit,
    PaymentMethod,
    PaymentStatus,
    PlanItemStatus,
    PrescriptionStatus,
    PriceConfidence,
    PriceOrigin,
    UserRole,
)
from app.models.market import Market
from app.models.meal_plan import MealPlan, PlanItem
from app.models.pantry import PantryItem
from app.models.payment import Payment
from app.models.prescription import Prescription, PrescriptionItem, PrescriptionMeal
from app.models.price_record import PriceRecord
from app.models.product import Product
from app.models.recipe import Recipe, RecipeIngredient
from app.models.shopping_list import ShoppingList, ShoppingListItem
from app.models.user import User

__all__ = [
    "AdminAction",
    "AdminActionType",
    "Base",
    "BaseUnit",
    "Market",
    "MealPlan",
    "MeasurementUnit",
    "PantryItem",
    "Payment",
    "PaymentMethod",
    "PaymentStatus",
    "PlanItem",
    "PlanItemStatus",
    "Prescription",
    "PrescriptionItem",
    "PrescriptionMeal",
    "PrescriptionStatus",
    "PriceConfidence",
    "PriceOrigin",
    "PriceRecord",
    "Product",
    "Recipe",
    "RecipeIngredient",
    "ShoppingList",
    "ShoppingListItem",
    "User",
    "UserRole",
]
