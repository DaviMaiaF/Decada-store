"""Histórico do que o super usuário fez com as contas."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, pg_enum
from app.models.enums import AdminActionType, UserRole
from app.models.user import User


class AdminAction(UUIDPrimaryKeyMixin, Base):
    """Fato histórico: como o registro de preço, não tem `updated_at`.

    **Não guarda e-mail nem nome da conta atingida**, só o vínculo com ela. Quando
    a conta é excluída, o `ON DELETE SET NULL` solta esse vínculo em todas as
    linhas: o histórico continua dizendo que uma conta de paciente foi excluída,
    mas não mais qual (decisão 9). Guardar o e-mail aqui faria o histórico lembrar
    justamente de quem pediu para ser esquecido.
    """

    __tablename__ = "admin_actions"

    # SET NULL também aqui: o super usuário que sai não leva o histórico junto.
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    target_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[AdminActionType] = mapped_column(
        pg_enum(AdminActionType, "admin_action_type"), nullable=False
    )
    target_role: Mapped[UserRole] = mapped_column(pg_enum(UserRole, "user_role"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    actor: Mapped["User | None"] = relationship(foreign_keys=[actor_id])
    target: Mapped["User | None"] = relationship(foreign_keys=[target_id])
