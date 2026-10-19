"""Schemas de cadastro, login e conta."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, StringConstraints

from app.models.enums import UserRole
from app.schemas.common import ApiModel
from app.services.security import MINIMUM_PASSWORD_LENGTH


class RegisterIn(BaseModel):
    email: EmailStr
    # O limite de cima é do bcrypt, que trabalha com no máximo 72 bytes.
    password: str = Field(min_length=MINIMUM_PASSWORD_LENGTH, max_length=72)
    full_name: str | None = Field(default=None, max_length=255)


# Sem espaço em volta, para "  " não passar por CRN preenchido.
_TextoObrigatorio = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class NutritionistRegisterIn(RegisterIn):
    """Cadastro de nutricionista: nome e CRN deixam de ser opcionais.

    São eles que aparecem como autoria da receita para o paciente.
    """

    full_name: Annotated[_TextoObrigatorio, Field(max_length=255)]
    # Texto livre, pelo mesmo motivo do CRN no plano: o formato muda por região.
    crn: Annotated[_TextoObrigatorio, Field(max_length=50)]


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # Para o app saber qual navegação abrir sem uma ida extra a /auth/me.
    role: UserRole


class UserOut(ApiModel):
    """A conta como o dono dela a vê. Nunca inclui o hash da senha."""

    id: uuid.UUID
    email: str
    full_name: str | None = None
    role: UserRole
    crn: str | None = None
    created_at: datetime


class DeletionReceiptOut(BaseModel):
    """Comprovante do que a exclusão levou embora."""

    deleted_at: datetime
    meal_plans_deleted: int
    pantry_items_deleted: int
    shopping_lists_deleted: int
    # Preços continuam existindo, sem vínculo com a pessoa.
    price_records_anonymized: int
