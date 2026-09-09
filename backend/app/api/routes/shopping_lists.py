"""Rotas da lista de compras: geração a partir do plano e consulta."""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.models import MealPlan, ShoppingList, ShoppingListItem
from app.schemas.shopping_list import GeneratedListOut, GenerateListIn, ShoppingListOut
from app.services.shopping import generate_shopping_list

router = APIRouter(tags=["listas de compras"])


@router.post(
    "/meal-plans/{plan_id}/shopping-lists",
    response_model=GeneratedListOut,
    status_code=status.HTTP_201_CREATED,
)
def create_shopping_list(
    session: DbSession,
    user: CurrentUser,
    plan_id: uuid.UUID,
    payload: GenerateListIn,
) -> GeneratedListOut:
    """Gera a lista de compras do plano, para uma região.

    Só entram itens que o usuário já confirmou. O que a despensa cobre é
    descontado, e o que ela cobre por inteiro fica na lista com quantidade zero
    em vez de sumir.

    Gerar de novo cria outra lista: o histórico de listas de um plano é
    proposital.
    """
    plan = session.scalars(
        select(MealPlan)
        .where(MealPlan.id == plan_id, MealPlan.user_id == user.id)
        .options(selectinload(MealPlan.items))
    ).first()

    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "plano alimentar não encontrado")

    result = generate_shopping_list(session, plan, payload.state_code.upper(), payload.city)
    session.commit()

    return GeneratedListOut(
        shopping_list=ShoppingListOut.model_validate(result.shopping_list),
        items_to_buy=result.items_to_buy,
        items_dispensed=result.items_dispensed,
        items_skipped=result.items_skipped,
        items_priced=result.cost.items_priced,
        items_without_price=result.cost.items_without_price,
        lowest_confidence=result.cost.lowest_confidence,
    )


@router.get("/shopping-lists/{list_id}", response_model=ShoppingListOut)
def read_shopping_list(
    session: DbSession, user: CurrentUser, list_id: uuid.UUID
) -> ShoppingList:
    """A lista com seus itens e o retrato do preço de cada um.

    Os itens vêm em lista plana, com a categoria dentro do produto: agrupar por
    corredor é decisão de quem exibe, não do servidor.
    """
    shopping_list = session.scalars(
        select(ShoppingList)
        .join(MealPlan)
        .where(ShoppingList.id == list_id, MealPlan.user_id == user.id)
        .options(selectinload(ShoppingList.items).selectinload(ShoppingListItem.product))
    ).first()

    if shopping_list is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "lista de compras não encontrada")

    return shopping_list
