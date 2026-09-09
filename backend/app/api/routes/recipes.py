"""Rotas das receitas: o que dá para fazer com o que já se tem."""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.models import MealPlan, ShoppingList, ShoppingListItem
from app.schemas.recipe import RecipeAvailabilityOut
from app.services.recipes import suggest_recipes

router = APIRouter(prefix="/recipes", tags=["receitas"])


@router.get("/suggestions", response_model=list[RecipeAvailabilityOut])
def read_suggestions(
    session: DbSession,
    user: CurrentUser,
    shopping_list_id: uuid.UUID | None = Query(
        default=None,
        description=(
            "Lista de compras a considerar. Sem ela, a disponibilidade conta "
            "só o que está na despensa agora."
        ),
    ),
    minimum_percentage: int = Query(default=0, ge=0, le=100),
) -> list:
    """Receitas ordenadas da mais disponível para a menos.

    A disponibilidade soma despensa e lista de compras: 100% quer dizer que a
    receita não exige nenhuma ida extra ao mercado, não que tudo já esteja em
    casa. Passe `minimum_percentage=100` para receber só o que dá para fazer.
    """
    shopping_list = None

    if shopping_list_id is not None:
        shopping_list = session.scalars(
            select(ShoppingList)
            .join(MealPlan)
            .where(ShoppingList.id == shopping_list_id, MealPlan.user_id == user.id)
            .options(selectinload(ShoppingList.items).selectinload(ShoppingListItem.product))
        ).first()

        if shopping_list is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "lista de compras não encontrada")

    return suggest_recipes(
        session, user.id, shopping_list, minimum_percentage=minimum_percentage
    )
