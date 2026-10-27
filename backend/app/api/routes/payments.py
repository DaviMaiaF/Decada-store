"""Rotas do pagamento **simulado** da lista de compras.

Nenhuma delas cobra nada: o gateway é o `payment_gateway`, que imita o
Mercado Pago. Os erros do gateway viram HTTP em `api/errors.py`.
"""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentPatient, DbSession
from app.models import MealPlan, Payment, ShoppingList
from app.schemas.payment import PaymentIn, PaymentOut
from app.services.payment_gateway import CardData, create_payment, settle_payment

router = APIRouter(tags=["pagamentos"])


def _get_list(session: DbSession, user: CurrentPatient, list_id: uuid.UUID) -> ShoppingList:
    """Lista do usuário, ou 404 — inclusive a de outra pessoa (decisão 10)."""
    shopping_list = session.scalars(
        select(ShoppingList)
        .join(MealPlan)
        .where(ShoppingList.id == list_id, MealPlan.user_id == user.id)
    ).first()

    if shopping_list is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "lista de compras não encontrada")
    return shopping_list


def _get_payment(
    session: DbSession, user: CurrentPatient, list_id: uuid.UUID, payment_id: uuid.UUID
) -> Payment:
    """Pagamento da lista do usuário, ou 404.

    Pagamento de outra pessoa e pagamento de outra lista respondem igual.
    """
    payment = session.scalars(
        select(Payment)
        .join(ShoppingList)
        .join(MealPlan)
        .where(
            Payment.id == payment_id,
            Payment.shopping_list_id == list_id,
            MealPlan.user_id == user.id,
        )
    ).first()

    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "pagamento não encontrado")
    return payment


@router.post(
    "/shopping-lists/{list_id}/payments",
    response_model=PaymentOut,
    status_code=status.HTTP_201_CREATED,
)
def pay_shopping_list(
    session: DbSession, user: CurrentPatient, list_id: uuid.UUID, payload: PaymentIn
) -> Payment:
    """Paga a lista — de mentira — pelo total estimado dela.

    Pix volta pendente, com o copia-e-cola. Cartão volta com a resposta do
    titular de teste: **recusado também é 201**, porque a tentativa foi
    registrada; o resultado está em `status`. Cartão inválido (número, validade,
    CVV) é 422 e não grava nada. Lista já paga é 409.
    """
    shopping_list = _get_list(session, user, list_id)

    card = None
    if payload.card is not None:
        card = CardData(**payload.card.model_dump())

    payment = create_payment(session, shopping_list, payload.method, card)
    session.commit()
    session.refresh(payment)
    return payment


@router.get("/shopping-lists/{list_id}/payments", response_model=list[PaymentOut])
def read_payments(session: DbSession, user: CurrentPatient, list_id: uuid.UUID) -> list[Payment]:
    """Tentativas de pagamento da lista, da mais recente à mais antiga.

    É por aqui que o app descobre, ao reabrir, que a lista já foi paga.
    """
    _get_list(session, user, list_id)

    return session.scalars(
        select(Payment)
        .where(Payment.shopping_list_id == list_id)
        .order_by(Payment.created_at.desc())
    ).all()


@router.get("/shopping-lists/{list_id}/payments/{payment_id}", response_model=PaymentOut)
def read_payment(
    session: DbSession, user: CurrentPatient, list_id: uuid.UUID, payment_id: uuid.UUID
) -> Payment:
    """Um pagamento. A tela do Pix consulta esta rota até ele sair de pendente."""
    return _get_payment(session, user, list_id, payment_id)


@router.post(
    "/shopping-lists/{list_id}/payments/{payment_id}/confirmation",
    response_model=PaymentOut,
)
def confirm_payment(
    session: DbSession, user: CurrentPatient, list_id: uuid.UUID, payment_id: uuid.UUID
) -> Payment:
    """Simula o recebimento: o Pix pago, o cartão que saiu da análise.

    Faz o papel do webhook que um PSP chamaria. Pagamento que não está
    pendente, ou de lista que outra tentativa já pagou, é 409.
    """
    payment = _get_payment(session, user, list_id, payment_id)

    settle_payment(session, payment)
    session.commit()
    session.refresh(payment)
    return payment
