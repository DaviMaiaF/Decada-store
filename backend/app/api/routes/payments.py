"""Rotas do pagamento **de teste** da lista de compras.

Nenhuma delas cobra nada: o Pix passa pelo Abacate Pay em modo de teste, e o
cartão é simulado pelo `payment_gateway`. Os erros do gateway viram HTTP em
`api/errors.py`.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentPatient, DbSession
from app.core.config import get_settings
from app.models import MealPlan, Payment, ShoppingList
from app.schemas.payment import PaymentIn, PaymentOut
from app.services.abacatepay import PixProvider, build_pix_provider
from app.services.payment_gateway import (
    CardData,
    create_payment,
    settle_payment,
    simulate_pix_payment,
    sync_pix_payment,
)

router = APIRouter(tags=["pagamentos"])


def get_pix_provider() -> PixProvider | None:
    """O Abacate Pay configurado. Os testes trocam esta função por um falso."""
    return build_pix_provider(get_settings().abacatepay_api_key)


PixProviderDep = Annotated[PixProvider | None, Depends(get_pix_provider)]


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
    session: DbSession,
    user: CurrentPatient,
    list_id: uuid.UUID,
    payload: PaymentIn,
    pix_provider: PixProviderDep,
) -> Payment:
    """Paga a lista — de mentira — pelo total estimado dela.

    Pix volta pendente, com o copia-e-cola do Abacate Pay em modo de teste; se
    ele não responder ou não estiver configurado, é 503. Cartão volta com a
    resposta do titular de teste: **recusado também é 201**, porque a tentativa
    foi registrada; o resultado está em `status`. Cartão inválido (número,
    validade, CVV) é 422 e não grava nada. Lista já paga é 409.
    """
    shopping_list = _get_list(session, user, list_id)

    card = None
    if payload.card is not None:
        card = CardData(**payload.card.model_dump())

    payment = create_payment(
        session, shopping_list, payload.method, card, pix_provider=pix_provider
    )
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
    session: DbSession,
    user: CurrentPatient,
    list_id: uuid.UUID,
    payment_id: uuid.UUID,
    pix_provider: PixProviderDep,
) -> Payment:
    """Um pagamento. A tela do Pix consulta esta rota até ele sair de pendente.

    Pix pendente é conferido no Abacate Pay antes de responder, para o caso de o
    aviso não ter chegado. Se ele não responder, vale o que está gravado.
    """
    payment = _get_payment(session, user, list_id, payment_id)

    sync_pix_payment(session, payment, pix_provider)
    session.commit()
    session.refresh(payment)
    return payment


@router.post(
    "/shopping-lists/{list_id}/payments/{payment_id}/confirmation",
    response_model=PaymentOut,
)
def confirm_payment(
    session: DbSession,
    user: CurrentPatient,
    list_id: uuid.UUID,
    payment_id: uuid.UUID,
    pix_provider: PixProviderDep,
) -> Payment:
    """Simula o recebimento: o Pix pago, o cartão que saiu da análise.

    O Pix passa pelo simulador do Abacate Pay, que só existe em modo de teste; se
    já tiver expirado, volta recusado. O cartão é simulado aqui mesmo. Pagamento
    que não está pendente, ou de lista que outra tentativa já pagou, é 409.
    """
    payment = _get_payment(session, user, list_id, payment_id)

    if payment.external_id:
        simulate_pix_payment(session, payment, pix_provider)
    else:
        settle_payment(session, payment)
    session.commit()
    session.refresh(payment)
    return payment
