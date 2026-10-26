"""Restrições da tabela `payments` que o banco garante sozinho.

O serviço já evita esses estados, mas a regra que importa — uma lista não é
paga duas vezes — não pode depender só de a rota lembrar de checar.
"""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import MealPlan, Payment, PaymentMethod, PaymentStatus, ShoppingList
from tests.conftest import novo_usuario

pytestmark = pytest.mark.db

AGORA = datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def lista(db_session) -> ShoppingList:
    usuario = novo_usuario("pagamento@example.com")
    plano = MealPlan(user=usuario, consent_at=AGORA, consent_version="v1")
    lista = ShoppingList(
        meal_plan=plano, state_code="DF", city="Brasília", estimated_total=Decimal("87.40")
    )
    db_session.add(lista)
    db_session.flush()
    return lista


def _pix(lista: ShoppingList, **campos) -> Payment:
    return Payment(
        shopping_list=lista,
        method=PaymentMethod.PIX,
        amount=Decimal("87.40"),
        pix_code="00020126-SIMULADO",
        **campos,
    )


def _grava_e_espera_erro(db_session, pagamento: Payment) -> None:
    db_session.add(pagamento)
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_pagamento_nasce_pendente(db_session, lista):
    pagamento = _pix(lista)
    db_session.add(pagamento)
    db_session.flush()
    db_session.refresh(pagamento)

    assert pagamento.status == PaymentStatus.PENDENTE
    assert pagamento.paid_at is None


def test_lista_aceita_varias_tentativas_mas_um_aprovado_so(db_session, lista):
    db_session.add_all(
        [
            _pix(lista, status=PaymentStatus.RECUSADO),
            _pix(lista, status=PaymentStatus.PENDENTE),
            _pix(lista, status=PaymentStatus.APROVADO, paid_at=AGORA),
        ]
    )
    db_session.flush()

    _grava_e_espera_erro(db_session, _pix(lista, status=PaymentStatus.APROVADO, paid_at=AGORA))


def test_valor_tem_de_ser_positivo(db_session, lista):
    pagamento = _pix(lista)
    pagamento.amount = Decimal("0")
    _grava_e_espera_erro(db_session, pagamento)


def test_pix_nao_carrega_dado_de_cartao(db_session, lista):
    _grava_e_espera_erro(db_session, _pix(lista, card_brand="visa", card_last_four="4242"))


def test_cartao_nao_carrega_codigo_pix(db_session, lista):
    pagamento = Payment(
        shopping_list=lista,
        method=PaymentMethod.CARTAO_CREDITO,
        amount=Decimal("87.40"),
        card_brand="visa",
        card_last_four="4242",
        pix_code="00020126-SIMULADO",
    )
    _grava_e_espera_erro(db_session, pagamento)


def test_excluir_a_lista_apaga_os_pagamentos(db_session, lista):
    db_session.add(_pix(lista))
    db_session.flush()

    db_session.delete(lista)
    db_session.flush()

    assert db_session.query(Payment).count() == 0
