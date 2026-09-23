"""Rotas da despensa: o que a pessoa já tem em casa."""

import uuid

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.models import PantryItem, Product
from app.schemas.pantry import (
    PantryItemIn,
    PantryItemOut,
    PantryItemUpdate,
    ProductSuggestionOut,
)
from app.services.pantry import suggest_products, user_pantry
from app.services.text import normalize_text

router = APIRouter(prefix="/pantry", tags=["despensa"])


def _get_item(session: DbSession, user: CurrentUser, item_id: uuid.UUID) -> PantryItem:
    item = session.scalars(
        select(PantryItem)
        .where(PantryItem.id == item_id, PantryItem.user_id == user.id)
        .options(selectinload(PantryItem.product))
    ).first()

    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "item não encontrado na sua despensa")
    return item


@router.get("", response_model=list[PantryItemOut])
def read_pantry(session: DbSession, user: CurrentUser) -> list[PantryItem]:
    """A despensa do usuário, do item mais recente ao mais antigo."""
    return user_pantry(session, user.id)


@router.post("", response_model=PantryItemOut, status_code=status.HTTP_201_CREATED)
def add_pantry_item(
    session: DbSession, user: CurrentUser, payload: PantryItemIn
) -> PantryItem:
    """Guarda um item na despensa.

    Aceita item só com texto: enquanto não houver produto do catálogo
    confirmado, o item aparece na despensa mas não abate nada da compra.
    """
    if payload.product_id is not None and session.get(Product, payload.product_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "produto não encontrado")

    item = PantryItem(
        user_id=user.id,
        raw_description=payload.raw_description,
        normalized_description=normalize_text(payload.raw_description),
        product_id=payload.product_id,
        quantity=payload.quantity,
        unit=payload.unit,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.patch("/{item_id}", response_model=PantryItemOut)
def update_pantry_item(
    session: DbSession,
    user: CurrentUser,
    item_id: uuid.UUID,
    payload: PantryItemUpdate,
) -> PantryItem:
    """Atualiza um item já existente na despensa para vincular produto ou medir."""
    item = _get_item(session, user, item_id)

    # Verifica se o produto informado existe
    if payload.product_id is not None and session.get(Product, payload.product_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "produto não encontrado")

    # Atualiza apenas os campos enviados (permitindo desvincular ou redefinir caso seja explicitamente fornecido)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(item, field, value)

    session.commit()
    # Recarrega o item e seu produto associado para retorno
    return _get_item(session, user, item_id)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_pantry_item(session: DbSession, user: CurrentUser, item_id: uuid.UUID) -> Response:
    """Tira um item da despensa."""
    session.delete(_get_item(session, user, item_id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{item_id}/candidates", response_model=list[ProductSuggestionOut])
def read_pantry_candidates(
    session: DbSession, user: CurrentUser, item_id: uuid.UUID
) -> list:
    """Produtos do catálogo parecidos com o que a pessoa digitou.

    Só sugere: enquanto o usuário não confirmar, `product_id` continua nulo e o
    item não abate nada da lista de compras.
    """
    return suggest_products(session, _get_item(session, user, item_id))