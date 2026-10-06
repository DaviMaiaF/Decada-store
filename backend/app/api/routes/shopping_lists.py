"""Rotas da lista de compras: geração a partir do plano e consulta."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.models import MealPlan, Product, ShoppingList, ShoppingListItem
from app.schemas.shopping_list import (
    ExtraItemIn,
    GeneratedListOut,
    GenerateListIn,
    PurchaseIn,
    ShoppingListItemOut,
    ShoppingListOut,
    ShoppingListSummaryOut,
    SimulatedItemOut,
    SimulationIn,
)
from app.services.shopping import add_extra_item, generate_shopping_list, remove_item
from app.services.simulation import simulate_item

router = APIRouter(tags=["listas de compras"])


def _get_plan(session: DbSession, user: CurrentUser, plan_id: uuid.UUID) -> MealPlan:
    """Plano do usuário, com os itens, ou 404.

    Plano de outra pessoa também devolve 404: dizer "existe, mas não é seu" já
    vazaria a informação de que aquela pessoa tem um plano alimentar.
    """
    plan = session.scalars(
        select(MealPlan)
        .where(MealPlan.id == plan_id, MealPlan.user_id == user.id)
        .options(selectinload(MealPlan.items))
    ).first()

    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "plano alimentar não encontrado")
    return plan


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
    plan = _get_plan(session, user, plan_id)

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


@router.get(
    "/meal-plans/{plan_id}/shopping-lists",
    response_model=list[ShoppingListSummaryOut],
)
def read_shopping_lists(
    session: DbSession, user: CurrentUser, plan_id: uuid.UUID
) -> list[ShoppingList]:
    """Listas já geradas para o plano, da mais recente à mais antiga.

    Gerar de novo cria outra lista, e é este histórico que o app percorre para
    reabrir na última: sem isto, fechar o app perdia a lista do mercado mesmo
    com ela salva no banco.

    Plano sem lista nenhuma devolve 200 com lista vazia.
    """
    _get_plan(session, user, plan_id)

    return session.scalars(
        select(ShoppingList)
        .where(ShoppingList.meal_plan_id == plan_id)
        # `created_at` é o horário da transação no Postgres e empata quando duas
        # listas nascem na mesma; `calculated_at` é carimbado em Python a cada
        # geração, e desempata.
        .order_by(ShoppingList.created_at.desc(), ShoppingList.calculated_at.desc())
    ).all()


def _get_item(
    session: DbSession, user: CurrentUser, list_id: uuid.UUID, item_id: uuid.UUID
) -> ShoppingListItem:
    """Item da lista do usuário, ou 404.

    Item de outra pessoa e item que não é desta lista respondem igual: 404,
    nunca 403. Ver decisão 10 e docs/lgpd.md.
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

    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "item não encontrado nesta lista")
    return item


def _get_list(session: DbSession, user: CurrentUser, list_id: uuid.UUID) -> ShoppingList:
    """Lista do usuário, com os itens e os produtos deles, ou 404."""
    shopping_list = session.scalars(
        select(ShoppingList)
        .join(MealPlan)
        .where(ShoppingList.id == list_id, MealPlan.user_id == user.id)
        .options(selectinload(ShoppingList.items).selectinload(ShoppingListItem.product))
    ).first()

    if shopping_list is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "lista de compras não encontrada")

    return shopping_list


@router.get("/shopping-lists/{list_id}", response_model=ShoppingListOut)
def read_shopping_list(
    session: DbSession, user: CurrentUser, list_id: uuid.UUID
) -> ShoppingList:
    """A lista com seus itens e o retrato do preço de cada um.

    Os itens vêm em lista plana, com a categoria dentro do produto: agrupar por
    corredor é decisão de quem exibe, não do servidor.
    """
    return _get_list(session, user, list_id)


@router.post(
    "/shopping-lists/{list_id}/items",
    response_model=ShoppingListItemOut,
    status_code=status.HTTP_201_CREATED,
)
def add_item(
    session: DbSession,
    user: CurrentUser,
    list_id: uuid.UUID,
    payload: ExtraItemIn,
) -> ShoppingListItem:
    """Acrescenta à compra um produto que o plano não pediu.

    É o ingrediente que falta para a receita e o que acabou em casa. A
    prescrição não muda — muda a lista de compras, que é outra coisa.

    O que a despensa cobre é descontado, como em qualquer item. Produto que já
    está na lista responde 409 em vez de entrar duas vezes: a segunda linha
    abateria de novo um estoque que a primeira já consumiu.

    Só o item novo é precificado; os preços que a lista congelou na geração
    ficam como estão.
    """
    shopping_list = _get_list(session, user, list_id)

    product = session.get(Product, payload.product_id)
    # Produto inexistente e produto de catálogo respondem igual ao resto da
    # API: o recurso pedido não está lá.
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "produto não encontrado")

    item = add_extra_item(session, shopping_list, product, payload.quantity, payload.unit)
    session.commit()
    session.refresh(item)
    return item


@router.delete(
    "/shopping-lists/{list_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_item(
    session: DbSession, user: CurrentUser, list_id: uuid.UUID, item_id: uuid.UUID
) -> None:
    """Tira da lista um item avulso.

    Só o avulso sai. Item que veio da prescrição responde 422: o aplicativo
    compara o preço do que foi prescrito, nunca decide que a pessoa não deve
    levar um alimento (decisão 8). Para ver a compra sem ele existe a
    simulação, que não grava nada.
    """
    item = _get_item(session, user, list_id, item_id)

    remove_item(session, item)
    session.commit()


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
    item = _get_item(session, user, list_id, item_id)

    if payload.purchased and item.purchased_at is None:
        item.purchased_at = datetime.now(timezone.utc)
    elif not payload.purchased:
        item.purchased_at = None

    session.commit()
    session.refresh(item)
    return item


@router.post("/shopping-lists/{list_id}/simulation", response_model=list[SimulatedItemOut])
def simulate_shopping_list(
    session: DbSession,
    user: CurrentUser,
    list_id: uuid.UUID,
    payload: SimulationIn,
) -> list[SimulatedItemOut]:
    """Quanto custaria a lista com outras quantidades. **Não grava nada.**

    A conta mora aqui, e não na tela, porque produto embalado sobe de pacote em
    pacote: multiplicar preço por quantidade — que é o que uma tela faria — sai
    errado para tudo que vem embalado.

    O preço usado é o que a lista congelou. Consultar de novo faria a simulação
    misturar a quantidade que a pessoa mexeu com a coleta que chegou no meio.
    """
    itens = {
        item.id: item
        for item in session.scalars(
            select(ShoppingListItem)
            .join(ShoppingList)
            .join(MealPlan)
            .where(
                ShoppingListItem.shopping_list_id == list_id,
                MealPlan.user_id == user.id,
            )
            .options(selectinload(ShoppingListItem.product))
        ).all()
    }

    simulados = []
    for pedido in payload.items:
        item = itens.get(pedido.item_id)
        # Item de outra pessoa e item que não é desta lista respondem igual.
        if item is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "item não encontrado nesta lista")

        simulado = simulate_item(item, pedido.quantity)
        simulados.append(SimulatedItemOut.model_validate(simulado))

    return simulados
