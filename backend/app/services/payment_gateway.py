"""Gateway de pagamento **de teste**: nenhum valor é cobrado.

O módulo existe para fechar o fluxo de compra na demonstração, e cada resposta
diz que é simulação.

Dois meios:

**Pix.** A cobrança é criada no Abacate Pay em modo de teste
([`abacatepay`](abacatepay.py), que recusa resposta de produção). O pagamento
nasce pendente, com o copia-e-cola devolvido por ele.

**Cartão de crédito.** Simulado aqui mesmo, sem provedor: o Abacate Pay exige um
token gerado no navegador e os dados da pessoa, inclusive o CPF. A resposta sai
na hora e depende do nome do titular,
como nos cartões de teste do Mercado Pago (`APRO` aprova, `OTHE` recusa,
`CONT` fica pendente...). Qualquer outro nome aprova, como um cartão comum. O
número precisa passar no Luhn e ter bandeira conhecida — o formulário se
comporta como o de verdade.

Do cartão só sobrevivem a bandeira e os quatro últimos dígitos. Número,
validade, CVV e titular entram por `CardData` e não vão para o banco
(decisão 5, minimização).
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Payment, PaymentMethod, PaymentStatus, ShoppingList
from app.services.abacatepay import PaymentProviderError, PixProvider

# Quanto tempo o Pix pode ser pago.
PIX_EXPIRES_IN_SECONDS = 60 * 60
# O Abacate Pay não aceita cobrança menor que esta.
PIX_MINIMUM_AMOUNT = Decimal("1.00")
# Status do Abacate Pay que encerram a tentativa, com o motivo que a pessoa vê.
_PIX_FINAL_REFUSALS = {
    "EXPIRED": "o Pix expirou sem pagamento",
    "CANCELLED": "o Pix foi cancelado",
    "FAILED": "o Pix não foi concluído",
}


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


def _ensure_not_paid(
    session: Session, shopping_list: ShoppingList, ignoring: Payment | None = None
) -> None:
    """`ListAlreadyPaidError` se outra tentativa já pagou a lista.

    `ignoring` é a tentativa sendo confirmada: o webhook pode tê-la aprovado
    entre a leitura e a confirmação, e isso não é pagar duas vezes.
    """
    query = select(Payment.id).where(
        Payment.shopping_list_id == shopping_list.id,
        Payment.status == PaymentStatus.APROVADO,
    )
    if ignoring is not None:
        query = query.where(Payment.id != ignoring.id)
    if session.scalars(query).first() is not None:
        raise ListAlreadyPaidError("esta lista já foi paga")


def create_payment(
    session: Session,
    shopping_list: ShoppingList,
    method: PaymentMethod,
    card: CardData | None = None,
    now: datetime | None = None,
    pix_provider: PixProvider | None = None,
) -> Payment:
    """Registra uma tentativa de pagamento da lista e devolve o resultado.

    O valor é o total estimado da lista, copiado. Pix sai pendente, com a
    cobrança criada em `pix_provider`; cartão sai com a resposta do titular de
    teste. Recusado também é gravado: é o histórico de tentativas que a tela
    mostra.
    """
    now = now or datetime.now(timezone.utc)
    _ensure_not_paid(session, shopping_list)

    amount = shopping_list.estimated_total
    if amount is None or amount <= 0:
        raise NothingToPayError("a lista não tem valor estimado para pagar")

    # O Payment só nasce depois da validação: ligado à lista, ele entraria na
    # sessão pela relação mesmo com o cartão recusado pelo formulário.
    if method == PaymentMethod.PIX:
        if pix_provider is None:
            raise PaymentProviderError("o pagamento por Pix não está configurado")
        if amount < PIX_MINIMUM_AMOUNT:
            raise NothingToPayError("o Pix aceita valores a partir de R$ 1,00")
        charge = pix_provider.create_pix(amount, PIX_EXPIRES_IN_SECONDS)
        payment = Payment(
            method=method,
            amount=amount,
            pix_code=charge.br_code,
            external_id=charge.external_id,
            expires_at=charge.expires_at,
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

    Se a lista foi paga por outra tentativa nesse meio-tempo, recusa: pagar duas
    vezes é o erro que mais importa evitar.
    """
    if payment.status != PaymentStatus.PENDENTE:
        raise PaymentNotPendingError("este pagamento não está mais pendente")
    _ensure_not_paid(session, payment.shopping_list, ignoring=payment)

    payment.status = PaymentStatus.APROVADO
    payment.status_detail = "pagamento aprovado"
    payment.paid_at = now or datetime.now(timezone.utc)
    session.flush()
    return payment


def apply_pix_status(
    session: Session, payment: Payment, provider_status: str, now: datetime | None = None
) -> Payment:
    """Leva ao pagamento o status que o Abacate Pay informou.

    Pode ser chamada de novo com o mesmo status: só pagamento pendente muda, o
    que torna inofensivo o aviso repetido. Se outra tentativa já pagou a lista, o
    Pix fica como está em vez de virar um segundo pagamento aprovado.
    """
    if payment.status != PaymentStatus.PENDENTE:
        return payment

    if provider_status == "PAID":
        try:
            settle_payment(session, payment, now)
        except ListAlreadyPaidError:
            return payment
    elif provider_status in _PIX_FINAL_REFUSALS:
        payment.status = PaymentStatus.RECUSADO
        payment.status_detail = _PIX_FINAL_REFUSALS[provider_status]
        session.flush()
    return payment


def sync_pix_payment(
    session: Session,
    payment: Payment,
    pix_provider: PixProvider | None,
    now: datetime | None = None,
) -> Payment:
    """Atualiza o Pix pendente com o status do provedor, se houver resposta.

    Cobre o aviso que não chega: na máquina de desenvolvimento, que o Abacate Pay
    não alcança, e no servidor publicado enquanto ele acorda. Sem resposta, vale o
    que está gravado — quem pergunta é a tela, que pergunta de novo em seguida.
    """
    if payment.status != PaymentStatus.PENDENTE or not payment.external_id or not pix_provider:
        return payment
    try:
        provider_status = pix_provider.check_pix(payment.external_id)
    except PaymentProviderError:
        return payment
    return apply_pix_status(session, payment, provider_status, now)


def simulate_pix_payment(
    session: Session,
    payment: Payment,
    pix_provider: PixProvider | None,
    now: datetime | None = None,
) -> Payment:
    """Pede ao Abacate Pay, em modo de teste, que dê o Pix por pago.

    Antes confere o que o provedor recusaria: Pix expirado não é mais pago, e a
    lista paga no cartão não recebe uma segunda confirmação.
    """
    if payment.status != PaymentStatus.PENDENTE:
        raise PaymentNotPendingError("este pagamento não está mais pendente")
    _ensure_not_paid(session, payment.shopping_list, ignoring=payment)
    if pix_provider is None:
        raise PaymentProviderError("o pagamento por Pix não está configurado")

    now = now or datetime.now(timezone.utc)
    if payment.expires_at is not None and payment.expires_at <= now:
        return apply_pix_status(session, payment, "EXPIRED", now)

    provider_status = pix_provider.simulate_pix(payment.external_id)
    return apply_pix_status(session, payment, provider_status, now)
