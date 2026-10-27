"""Testes do gateway de pagamento simulado.

As funções puras (Luhn, bandeira, BR Code) não tocam no banco. Criar e
confirmar pagamento usa o banco, porque a regra que importa — a lista não é
paga duas vezes — é consultada lá.
"""

from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.models import MealPlan, PaymentMethod, PaymentStatus, ShoppingList
from app.services.payment_gateway import (
    PIX_KEY,
    CardData,
    InvalidCardError,
    ListAlreadyPaidError,
    NothingToPayError,
    PaymentNotPendingError,
    build_pix_code,
    crc16_ccitt,
    create_payment,
    detect_brand,
    luhn_valid,
    settle_payment,
)
from tests.conftest import novo_usuario

AGORA = datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc)

# Cartões de teste do Mercado Pago.
VISA = "4235 6477 2802 5682"
MASTERCARD = "5031 4332 1540 6351"
AMEX = "3753 651535 56885"
ELO = "5067 7667 8388 8311"


def _cartao(titular="APRO", numero=VISA, mes=11, ano=2030, cvv="123") -> CardData:
    return CardData(
        number=numero,
        holder_name=titular,
        expiration_month=mes,
        expiration_year=ano,
        security_code=cvv,
    )


# --- Funções puras -----------------------------------------------------------


@pytest.mark.parametrize("numero", ["4235647728025682", "5031433215406351", "4111111111111111"])
def test_luhn_aceita_numero_valido(numero):
    assert luhn_valid(numero)


@pytest.mark.parametrize("numero", ["4235647728025683", "1234567812345678", "", "4235-6477"])
def test_luhn_recusa_numero_invalido(numero):
    assert not luhn_valid(numero)


@pytest.mark.parametrize(
    ("numero", "bandeira"),
    [
        ("4235647728025682", "visa"),
        ("5031433215406351", "mastercard"),
        ("5555555555554444", "mastercard"),
        ("2223000048400011", "mastercard"),
        ("375365153556885", "amex"),
        ("5067766783888311", "elo"),
        ("6062825624254001", "hipercard"),
        ("6011111111111117", None),
    ],
)
def test_bandeira_pelo_prefixo(numero, bandeira):
    assert detect_brand(numero) == bandeira


def test_crc16_bate_com_o_valor_de_referencia():
    # Valor de verificação do CRC-16/CCITT-FALSE para "123456789".
    assert crc16_ccitt("123456789") == "29B1"


def test_codigo_pix_tem_formato_de_br_code_e_aponta_para_chave_inexistente():
    codigo = build_pix_code(Decimal("87.40"), "SIMULADO123")

    assert codigo.startswith("000201")
    assert PIX_KEY in codigo
    assert "540587.40" in codigo  # campo 54, valor com 5 caracteres
    assert "DECADA SIMULADO" in codigo
    # O CRC do fim confere com o resto do código.
    assert codigo[-4:] == crc16_ccitt(codigo[:-4])


# --- Criar e confirmar pagamento --------------------------------------------


@pytest.fixture
def lista(db_session) -> ShoppingList:
    usuario = novo_usuario("gateway@example.com")
    plano = MealPlan(user=usuario, consent_at=AGORA, consent_version="v1")
    lista = ShoppingList(
        meal_plan=plano, state_code="DF", city="Brasília", estimated_total=Decimal("87.40")
    )
    db_session.add(lista)
    db_session.flush()
    return lista


@pytest.mark.db
def test_pix_nasce_pendente_com_codigo_e_valor_da_lista(db_session, lista):
    pagamento = create_payment(db_session, lista, PaymentMethod.PIX, now=AGORA)

    assert pagamento.status == PaymentStatus.PENDENTE
    assert pagamento.amount == Decimal("87.40")
    assert PIX_KEY in pagamento.pix_code
    assert pagamento.paid_at is None
    assert pagamento.card_brand is None


@pytest.mark.db
def test_valor_e_copiado_e_nao_acompanha_a_lista(db_session, lista):
    pagamento = create_payment(db_session, lista, PaymentMethod.PIX, now=AGORA)
    lista.estimated_total = Decimal("120.00")
    db_session.flush()

    assert pagamento.amount == Decimal("87.40")


@pytest.mark.db
def test_confirmar_pix_aprova_e_registra_a_hora(db_session, lista):
    pagamento = create_payment(db_session, lista, PaymentMethod.PIX, now=AGORA)

    settle_payment(db_session, pagamento, now=AGORA)

    assert pagamento.status == PaymentStatus.APROVADO
    assert pagamento.paid_at == AGORA


@pytest.mark.db
@pytest.mark.parametrize(
    ("titular", "status"),
    [
        ("APRO", PaymentStatus.APROVADO),
        ("apro", PaymentStatus.APROVADO),
        ("Maria da Silva", PaymentStatus.APROVADO),
        ("OTHE", PaymentStatus.RECUSADO),
        ("FUND", PaymentStatus.RECUSADO),
        ("SECU", PaymentStatus.RECUSADO),
        ("CONT", PaymentStatus.PENDENTE),
    ],
)
def test_resposta_do_cartao_vem_do_titular_de_teste(db_session, lista, titular, status):
    pagamento = create_payment(
        db_session, lista, PaymentMethod.CARTAO_CREDITO, _cartao(titular), now=AGORA
    )

    assert pagamento.status == status
    assert pagamento.status_detail
    assert (pagamento.paid_at is not None) == (status == PaymentStatus.APROVADO)


@pytest.mark.db
def test_do_cartao_ficam_so_a_bandeira_e_o_final(db_session, lista):
    pagamento = create_payment(
        db_session, lista, PaymentMethod.CARTAO_CREDITO, _cartao(numero=MASTERCARD), now=AGORA
    )

    assert pagamento.card_brand == "mastercard"
    assert pagamento.card_last_four == "6351"
    assert pagamento.pix_code is None


@pytest.mark.db
@pytest.mark.parametrize(
    ("cartao", "motivo"),
    [
        (_cartao(numero="4235 6477 2802 5683"), "número"),
        (_cartao(numero="6011 1111 1111 1117"), "bandeira"),
        (_cartao(titular="  "), "titular"),
        (_cartao(mes=13), "mês"),
        (_cartao(mes=9, ano=2026), "vencido"),
        (_cartao(cvv="12"), "segurança"),
        (_cartao(numero=AMEX, cvv="123"), "segurança"),
    ],
)
def test_cartao_invalido_e_recusado_antes_do_gateway(db_session, lista, cartao, motivo):
    with pytest.raises(InvalidCardError, match=motivo):
        create_payment(db_session, lista, PaymentMethod.CARTAO_CREDITO, cartao, now=AGORA)


@pytest.mark.db
def test_cartao_vale_ate_o_fim_do_mes_impresso(db_session, lista):
    cartao = _cartao(numero=AMEX, mes=10, ano=26, cvv="1234")

    pagamento = create_payment(db_session, lista, PaymentMethod.CARTAO_CREDITO, cartao, now=AGORA)

    assert pagamento.status == PaymentStatus.APROVADO


@pytest.mark.db
def test_cartao_sem_dados_e_recusado(db_session, lista):
    with pytest.raises(InvalidCardError):
        create_payment(db_session, lista, PaymentMethod.CARTAO_CREDITO, None, now=AGORA)


@pytest.mark.db
def test_lista_sem_total_nao_tem_o_que_pagar(db_session, lista):
    lista.estimated_total = None

    with pytest.raises(NothingToPayError):
        create_payment(db_session, lista, PaymentMethod.PIX, now=AGORA)


@pytest.mark.db
def test_tentativa_recusada_nao_impede_a_seguinte(db_session, lista):
    create_payment(db_session, lista, PaymentMethod.CARTAO_CREDITO, _cartao("OTHE"), now=AGORA)

    pagamento = create_payment(
        db_session, lista, PaymentMethod.CARTAO_CREDITO, _cartao(), now=AGORA
    )

    assert pagamento.status == PaymentStatus.APROVADO


@pytest.mark.db
def test_lista_paga_nao_aceita_outro_pagamento(db_session, lista):
    create_payment(db_session, lista, PaymentMethod.CARTAO_CREDITO, _cartao(), now=AGORA)

    with pytest.raises(ListAlreadyPaidError):
        create_payment(db_session, lista, PaymentMethod.PIX, now=AGORA)


@pytest.mark.db
def test_pix_pendente_nao_e_confirmado_se_a_lista_foi_paga_no_cartao(db_session, lista):
    pix = create_payment(db_session, lista, PaymentMethod.PIX, now=AGORA)
    create_payment(db_session, lista, PaymentMethod.CARTAO_CREDITO, _cartao(), now=AGORA)

    with pytest.raises(ListAlreadyPaidError):
        settle_payment(db_session, pix, now=AGORA)
    assert pix.status == PaymentStatus.PENDENTE


@pytest.mark.db
@pytest.mark.parametrize("titular", ["APRO", "OTHE"])
def test_aprovado_e_recusado_sao_finais(db_session, lista, titular):
    pagamento = create_payment(
        db_session, lista, PaymentMethod.CARTAO_CREDITO, _cartao(titular), now=AGORA
    )

    with pytest.raises(PaymentNotPendingError):
        settle_payment(db_session, pagamento, now=AGORA)


@pytest.mark.db
def test_cartao_em_analise_pode_ser_confirmado(db_session, lista):
    pagamento = create_payment(
        db_session, lista, PaymentMethod.CARTAO_CREDITO, _cartao("CONT"), now=AGORA
    )

    settle_payment(db_session, pagamento, now=AGORA)

    assert pagamento.status == PaymentStatus.APROVADO
