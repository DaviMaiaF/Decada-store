"""Schemas de cadastro, login e conta."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ApiModel
from app.services.security import MINIMUM_PASSWORD_LENGTH


class RegisterIn(BaseModel):
    email: EmailStr
    # O limite de cima é do bcrypt, que trabalha com no máximo 72 bytes.
    password: str = Field(min_length=MINIMUM_PASSWORD_LENGTH, max_length=72)
    full_name: str | None = Field(default=None, max_length=255)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(ApiModel):
    """A conta como o dono dela a vê. Nunca inclui o hash da senha."""

    id: uuid.UUID
    email: str
    full_name: str | None = None
    created_at: datetime


class DeletionReceiptOut(BaseModel):
    """Comprovante do que a exclusão levou embora."""

    deleted_at: datetime
    meal_plans_deleted: int
    pantry_items_deleted: int
    shopping_lists_deleted: int
    # Preços continuam existindo, sem vínculo com a pessoa.
    price_records_anonymized: int
