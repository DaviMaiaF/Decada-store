"""Schemas do plano que a nutricionista monta, e de como o paciente o recebe.

Os limites de tamanho não são estéticos. O mesmo plano vira PDF, e o import lê
de volta esse PDF (decisão 7): linha de item com 90 caracteres ou mais é lida
como parágrafo de orientação, e nome de refeição com mais de 40 deixa de ser
reconhecido como cabeçalho. Recusar aqui é o que garante que o PDF gerado
volta inteiro.
"""

import re
import uuid
from datetime import datetime, time
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, StringConstraints, field_validator

from app.models.enums import MeasurementUnit, PrescriptionStatus
from app.schemas.common import ApiModel

# O separador de medidas do formato do Dietbox. No nome do alimento, partiria
# a linha no lugar errado ao ler o PDF.
_DASH_SEPARATOR = re.compile(r"\s[-–—]\s")
_STARTS_WITH_LETTER = re.compile(r"^[^\W\d_]")


def _text(max_length: int, min_length: int = 1):
    return Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length),
    ]


def _sem_separador(valor: str | None) -> str | None:
    if valor is not None and _DASH_SEPARATOR.search(valor):
        raise ValueError('não use " - " no nome: é o separador de medidas do plano')
    return valor


class PrescriptionItemIn(BaseModel):
    food: _text(45)
    household_measure: _text(25, min_length=0) | None = None
    # Mesma precisão da coluna: Numeric(12, 3).
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    unit: MeasurementUnit

    @field_validator("food")
    @classmethod
    def alimento_valido(cls, valor: str) -> str:
        if not _STARTS_WITH_LETTER.match(valor):
            # Linha que começa com número é lida no outro formato do import.
            raise ValueError("o nome do alimento começa com letra")
        return _sem_separador(valor)

    @field_validator("household_measure")
    @classmethod
    def medida_valida(cls, valor: str | None) -> str | None:
        return _sem_separador(valor) or None


class PrescriptionMealIn(BaseModel):
    name: _text(40)
    # É o horário que faz o import reconhecer o cabeçalho, qualquer que seja o nome.
    time: time
    notes: _text(2000, min_length=0) | None = None
    # O que se come: vai para a lista de compras do paciente.
    items: list[PrescriptionItemIn] = Field(min_length=1, max_length=30)
    # Cada opção substitui a refeição inteira. O paciente lê; não vai para a compra.
    substitutions: list[Annotated[list[PrescriptionItemIn], Field(min_length=1, max_length=30)]] = (
        Field(default_factory=list, max_length=5)
    )

    @field_validator("name")
    @classmethod
    def nome_valido(cls, valor: str) -> str:
        if not _STARTS_WITH_LETTER.match(valor):
            raise ValueError("o nome da refeição começa com letra")
        return valor

    @field_validator("notes")
    @classmethod
    def sem_vazio(cls, valor: str | None) -> str | None:
        return valor or None


class PrescriptionIn(BaseModel):
    """O plano inteiro. Serve para criar e para editar, como o editor o tem."""

    title: _text(255, min_length=0) | None = None
    patient_name: _text(255, min_length=0) | None = None
    notes: _text(5000, min_length=0) | None = None
    meals: list[PrescriptionMealIn] = Field(min_length=1, max_length=12)

    @field_validator("title", "patient_name", "notes")
    @classmethod
    def sem_vazio(cls, valor: str | None) -> str | None:
        return valor or None


class SendIn(BaseModel):
    patient_email: EmailStr


class ResponseIn(BaseModel):
    """Aceite do paciente. Sem ele o plano não é gravado (decisão 5)."""

    consent_accepted: bool


# --- saída ---


class PrescriptionItemOut(ApiModel):
    food: str
    household_measure: str | None = None
    quantity: Decimal
    unit: MeasurementUnit


class PrescriptionMealOut(ApiModel):
    name: str
    time: time
    notes: str | None = None
    items: list[PrescriptionItemOut]
    substitutions: list[list[PrescriptionItemOut]]


class PrescribedPlanOut(ApiModel):
    """A parte do plano que é só para ler: refeições, substituições, orientação."""

    notes: str | None = None
    meals: list[PrescriptionMealOut]


class PrescriptionOut(ApiModel):
    id: uuid.UUID
    title: str | None = None
    patient_name: str | None = None
    patient_email: str | None = None
    notes: str | None = None
    status: PrescriptionStatus
    sent_at: datetime | None = None
    responded_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    meals: list[PrescriptionMealOut]


class PrescriptionSummaryOut(ApiModel):
    """Plano na listagem da nutricionista, sem as refeições."""

    id: uuid.UUID
    title: str | None = None
    patient_name: str | None = None
    patient_email: str | None = None
    status: PrescriptionStatus
    sent_at: datetime | None = None
    updated_at: datetime
    meal_count: int


class PrescriptionAuthorOut(ApiModel):
    """Quem assina o plano. Nunca o e-mail da nutricionista."""

    full_name: str | None = None
    crn: str | None = None


class ReceivedPrescriptionOut(ApiModel):
    """Plano enviado ao paciente, esperando resposta.

    Sem o e-mail para o qual foi enviado: quem está lendo é o dono dele.
    """

    id: uuid.UUID
    title: str | None = None
    notes: str | None = None
    sent_at: datetime | None = None
    author: PrescriptionAuthorOut
    meals: list[PrescriptionMealOut]
