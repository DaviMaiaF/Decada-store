"""Base declarativa e mixins compartilhados pelos modelos."""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, MetaData, Uuid, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Convenção de nomes: sem isto o Postgres gera nomes automáticos para índices e
# constraints, e o Alembic não consegue removê-los depois em uma migração.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UUIDPrimaryKeyMixin:
    """Chave primária UUID.

    Escolha deliberada: identificadores aparecem em URLs de recursos de saúde
    (`/planos/{id}`); com inteiro sequencial seria possível enumerar planos de
    outros usuários.
    """

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    """Datas de criação e atualização, preenchidas pelo banco."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


def pg_enum(enum_class: type[Enum], type_name: str) -> SAEnum:
    """Tipo ENUM do Postgres a partir de uma enumeração do domínio.

    `values_callable` faz o banco guardar o valor ("kg"), e não o nome do
    membro ("QUILOGRAMA") — que é o padrão do SQLAlchemy e deixaria o dump do
    banco ilegível.
    """
    return SAEnum(enum_class, name=type_name, values_callable=lambda e: [m.value for m in e])
