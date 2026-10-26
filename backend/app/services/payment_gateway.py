"""Gateway de pagamento **simulado**, no molde do Mercado Pago.

Nada aqui fala com banco, adquirente ou PSP: o módulo existe para fechar o
fluxo de compra na demonstração, e cada resposta diz que é simulação. Nenhum
valor é cobrado.

Dois meios:

**Pix.** O pagamento nasce pendente, com um código copia-e-cola no formato do
BR Code (EMV, com CRC16). A chave é `simulado@decada.invalid`: o domínio
`.invalid` é reservado e nunca existe, então o código não paga ninguém nem se
lido por um app de banco de verdade. O recebimento é simulado por
`settle_payment`, no lugar do webhook que um PSP chamaria.

**Cartão de crédito.** A resposta sai na hora e depende do nome do titular,
como nos cartões de teste do Mercado Pago (`APRO` aprova, `OTHE` recusa,
`CONT` fica pendente...). Qualquer outro nome aprova, como um cartão comum. O
número precisa passar no Luhn e ter bandeira conhecida — o formulário se
comporta como o de verdade.

Do cartão só sobrevivem a bandeira e os quatro últimos dígitos. Número,
validade, CVV e titular entram por `CardData` e não vão para o banco
(decisão 5, minimização).
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Payment, PaymentMethod, PaymentStatus, ShoppingList

# Chave Pix que não pode existir: `.invalid` é reservado (RFC 2606).
PIX_KEY = "simulado@decada.invalid"
PIX_MERCHANT_NAME = "DECADA SIMULADO"
PIX_MERCHANT_CITY = "BRASILIA"


class PaymentError(Exception):
    """Base dos erros do gateway: a mensagem é a que a pessoa vê."""


class InvalidCardError(PaymentError):
    """Cartão que o formulário de verdade também recusaria."""


class NothingToPayError(PaymentError):
    """Lista sem total estimado: não há valor a cobrar."""


class ListAlreadyPaidError(PaymentError):
    """A lista já tem um pagamento aprovado."""


class PaymentNotPendingError(PaymentError):
    """Só pagamento pendente pode ser confirmado: aprovado e recusado são finais."""


@dataclass(frozen=True)
class CardData:
    """O que o formulário do cartão envia. Vive só durante a chamada."""

    number: str
    holder_name: str
    expiration_month: int
    expiration_year: int
    security_code: str


@dataclass(frozen=True)
class _CardOutcome:
    status: PaymentStatus
    detail: str


# Titulares de teste do Mercado Pago, com o mesmo efeito.
_TEST_HOLDERS: dict[str, _CardOutcome] = {
    "APRO": _CardOutcome(PaymentStatus.APROVADO, "pagamento aprovado"),
    "OTHE": _CardOutcome(PaymentStatus.RECUSADO, "recusado por erro geral"),
    "CONT": _CardOutcome(PaymentStatus.PENDENTE, "pagamento em análise"),
    "FUND": _CardOutcome(PaymentStatus.RECUSADO, "recusado por saldo insuficiente"),
    "SECU": _CardOutcome(PaymentStatus.RECUSADO, "recusado: código de segurança inválido"),
    "EXPI": _CardOutcome(PaymentStatus.RECUSADO, "recusado: cartão vencido"),
    "CALL": _CardOutcome(PaymentStatus.RECUSADO, "recusado: autorize o pagamento com o banco"),
}
_DEFAULT_OUTCOME = _TEST_HOLDERS["APRO"]

# Prefixos da Elo vêm antes dos da Visa e da Mastercard porque se sobrepõem a
# eles (4011, 5067...). Lista reduzida: cobre os cartões de teste e os
# intervalos mais comuns, não é tabela de BIN.
_ELO_PREFIXES = (
    "4011", "4312", "4389", "4514", "4576", "5041", "5066", "5067",
    "509", "6277", "6362", "6363", "650", "6516", "6550",
)  # fmt: skip


def only_digits(value: str) -> str:
    """Número como a pessoa digitou, sem espaço nem hífen."""
    return "".join(caractere for caractere in value if caractere.isdigit())


def luhn_valid(number: str) -> bool:
    """Dígito verificador do cartão (algoritmo de Luhn)."""
    if not number.isdigit():
        return False
    total = 0
    for posicao, caractere in enumerate(reversed(number)):
        digito = int(caractere)
        if posicao % 2 == 1:
            digito *= 2
            if digito > 9:
                digito -= 9
        total += digito
    return total % 10 == 0


def detect_brand(number: str) -> str | None:
    """Bandeira pelo prefixo do número, ou None se não reconhecida."""
    if number.startswith(_ELO_PREFIXES):
        return "elo"
    if number.startswith("606282"):
        return "hipercard"
    if number.startswith(("34", "37")):
        return "amex"
    if number.startswith("4"):
        return "visa"
    prefixo = int(number[:4]) if len(number) >= 4 else 0
    # 50xx que não é Elo é Maestro, da Mastercard — e é onde mora o cartão de
    # teste Mastercard do Mercado Pago (5031...).
    if 5000 <= prefixo <= 5599 or 2221 <= prefixo <= 2720:
        return "mastercard"
    return None


def _validate_card(card: CardData, now: datetime) -> tuple[str, str]:
    """Bandeira e número limpo, ou `InvalidCardError` com o motivo."""
    number = only_digits(card.number)
    if not 13 <= len(number) <= 19 or not luhn_valid(number):
        raise InvalidCardError("número do cartão inválido")

    brand = detect_brand(number)
    if brand is None:
        raise InvalidCardError("bandeira do cartão não aceita")

    if not card.holder_name.strip():
        raise InvalidCardError("informe o nome do titular")

    if not 1 <= card.expiration_month <= 12:
        raise InvalidCardError("mês de validade inválido")
    ano = card.expiration_year + 2000 if card.expiration_year < 100 else card.expiration_year
    # O cartão vale até o último dia do mês impresso.
    if (ano, card.expiration_month) < (now.year, now.month):
        raise InvalidCardError("cartão vencido")

    tamanho_cvv = 4 if brand == "amex" else 3
    if len(card.security_code) != tamanho_cvv or not card.security_code.isdigit():
        raise InvalidCardError("código de segurança inválido")

    return brand, number


def _emv(field_id: str, value: str) -> str:
    return f"{field_id}{len(value):02d}{value}"


def crc16_ccitt(payload: str) -> str:
    """CRC16-CCITT (0x1021, início 0xFFFF), o que o BR Code exige no campo 63."""
    crc = 0xFFFF
    for byte in payload.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else crc << 1
            crc &= 0xFFFF
    return f"{crc:04X}"


def build_pix_code(amount: Decimal, txid: str) -> str:
    """Copia-e-cola no formato do BR Code, apontando para a chave que não existe."""
    conta = _emv("00", "br.gov.bcb.pix") + _emv("01", PIX_KEY)
    payload = (
        _emv("00", "01")
        + _emv("26", conta)
        + _emv("52", "0000")
        + _emv("53", "986")
        + _emv("54", f"{amount:.2f}")
        + _emv("58", "BR")
        + _emv("59", PIX_MERCHANT_NAME)
        + _emv("60", PIX_MERCHANT_CITY)
        + _emv("62", _emv("05", txid))
        + "6304"
    )
    return payload + crc16_ccitt(payload)


def _ensure_not_paid(session: Session, shopping_list: ShoppingList) -> None:
    aprovado = session.scalars(
        select(Payment.id).where(
            Payment.shopping_list_id == shopping_list.id,
            Payment.status == PaymentStatus.APROVADO,
        )
    ).first()
    if aprovado is not None:
        raise ListAlreadyPaidError("esta lista já foi paga")


def create_payment(
    session: Session,
    shopping_list: ShoppingList,
    method: PaymentMethod,
    card: CardData | None = None,
    now: datetime | None = None,
) -> Payment:
    """Registra uma tentativa de pagamento da lista e devolve o resultado.

    O valor é o total estimado da lista, copiado. Pix sai pendente; cartão sai
    com a resposta do titular de teste. Recusado também é gravado: é o
    histórico de tentativas que a tela mostra.
    """
    now = now or datetime.now(timezone.utc)
    _ensure_not_paid(session, shopping_list)

    amount = shopping_list.estimated_total
    if amount is None or amount <= 0:
        raise NothingToPayError("a lista não tem valor estimado para pagar")

    # O Payment só nasce depois da validação: ligado à lista, ele entraria na
    # sessão pela relação mesmo com o cartão recusado pelo formulário.
    if method == PaymentMethod.PIX:
        txid = "SIMULADO" + uuid.uuid4().hex[:17].upper()
        payment = Payment(
            method=method,
            amount=amount,
            pix_code=build_pix_code(amount, txid),
            status=PaymentStatus.PENDENTE,
            status_detail="aguardando pagamento",
        )
    else:
        if card is None:
            raise InvalidCardError("informe os dados do cartão")
        brand, number = _validate_card(card, now)
        outcome = _TEST_HOLDERS.get(card.holder_name.strip().upper(), _DEFAULT_OUTCOME)
        payment = Payment(
            method=method,
            amount=amount,
            card_brand=brand,
            card_last_four=number[-4:],
            status=outcome.status,
            status_detail=outcome.detail,
            paid_at=now if outcome.status == PaymentStatus.APROVADO else None,
        )

    payment.shopping_list = shopping_list
    session.add(payment)
    session.flush()
    return payment


def settle_payment(session: Session, payment: Payment, now: datetime | None = None) -> Payment:
    """Confirma um pagamento pendente — o Pix recebido, o cartão que saiu da análise.

    Faz o papel do webhook do PSP. Se a lista foi paga por outra tentativa
    nesse meio-tempo, recusa: pagar duas vezes é o erro que mais importa evitar.
    """
    if payment.status != PaymentStatus.PENDENTE:
        raise PaymentNotPendingError("este pagamento não está mais pendente")
    _ensure_not_paid(session, payment.shopping_list)

    payment.status = PaymentStatus.APROVADO
    payment.status_detail = "pagamento aprovado"
    payment.paid_at = now or datetime.now(timezone.utc)
    session.flush()
    return payment
