"""Rotas da lista de compras: geração a partir do plano e consulta."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.models import MealPlan, ShoppingList, ShoppingListItem
from app.schemas.shopping_list import (
    GeneratedListOut,
    GenerateListIn,
    PurchaseIn,
    ShoppingListItemOut,
    ShoppingListOut,
)
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
        pantry_savings=result.cost.pantry_savings,
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


@router.patch(
    "/shopping-lists/{list_id}/items/{item_id}",
    response_model=ShoppingListItemOut,
)
def set_item_purchased(
    session: DbSession,
    user: CurrentUser,
    list_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: PurchaseIn,
) -> ShoppingListItem:
    """Marca ou desmarca um item como comprado.

    Guarda o instante, não um booleano: a tela rabisca o item a partir dele e
    fica registrado *quando* a pessoa pegou aquilo na prateleira.

    Marcar duas vezes não move a data. A segunda chamada com o mesmo valor é
    inofensiva de propósito — dentro do mercado o toque repetido acontece, e
    seria ruim que ele reescrevesse o horário.

    Item que a despensa dispensou também aceita marcação: o servidor guarda o
    fato, e oferecer ou não o botão é decisão da tela.
    """
    item = session.scalars(
        select(ShoppingListItem)
        .join(ShoppingList)
        .join(MealPlan)
        .where(
            ShoppingListItem.id == item_id,
            ShoppingListItem.shopping_list_id == list_id,
            MealPlan.user_id == user.id,
        )
        .options(selectinload(ShoppingListItem.product))
    ).first()

    # Item de outra pessoa e item que não é desta lista respondem igual: 404,
    # nunca 403. Ver decisão 10 e docs/lgpd.md.
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "item não encontrado nesta lista")

    if payload.purchased and item.purchased_at is None:
        item.purchased_at = datetime.now(timezone.utc)
    elif not payload.purchased:
        item.purchased_at = None

    session.commit()
    session.refresh(item)
    return item
