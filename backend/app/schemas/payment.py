"""Schemas do pagamento simulado."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import PaymentMethod, PaymentStatus
from app.schemas.common import ApiModel


class CardIn(BaseModel):
    """Dados do cartão, como o formulário envia. Não são gravados.

    Os limites aqui são só de tamanho: quem decide se o cartão é válido é o
    gateway, que devolve o motivo em português.
    """

    # Aceita espaço e hífen, como a pessoa digita: "4235 6477 2802 5682".
    number: str = Field(min_length=1, max_length=23)
    holder_name: str = Field(min_length=1, max_length=60)
    expiration_month: int
    expiration_year: int
    security_code: str = Field(min_length=1, max_length=4)


class PaymentIn(BaseModel):
    """Pedido de pagamento da lista. Cartão só acompanha o meio cartão."""

    method: PaymentMethod
    card: CardIn | None = None

    @model_validator(mode="after")
    def _card_only_with_credit_card(self) -> "PaymentIn":
        # Dado de cartão num Pix não serve para nada, e minimização (decisão 5)
        # é não aceitar o que não serve.
        if self.method == PaymentMethod.PIX and self.card is not None:
            raise ValueError("Pix não leva dados de cartão")
        return self


class PaymentOut(ApiModel):
    """Um pagamento, com o que dá para mostrar dele."""

    id: uuid.UUID
    shopping_list_id: uuid.UUID
    method: PaymentMethod
    status: PaymentStatus
    status_detail: str | None = None
    amount: Decimal
    card_brand: str | None = None
    card_last_four: str | None = None
    pix_code: str | None = None
    paid_at: datetime | None = None
    created_at: datetime
    # Sempre verdadeiro: está no contrato para a tela não ter como esquecer de
    # avisar que nada foi cobrado.
    simulated: Literal[True] = True
