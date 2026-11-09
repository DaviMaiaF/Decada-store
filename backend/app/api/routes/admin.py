"""API do painel do super usuário.

Para qualquer outro papel estas rotas respondem 404: elas simplesmente não existem
(decisão 10). As regras ficam em `services/admin.py`.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentAdmin, DbSession
from app.models import UserRole
from app.schemas.admin import (
    AdminAccountOut,
    AdminAccountPageOut,
    AdminActionOut,
    AdminActionPageOut,
    DashboardOut,
)
from app.schemas.auth import DeletionReceiptOut
from app.services import admin as admin_service

router = APIRouter(prefix="/admin/api", tags=["super usuário"])

Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


@router.get("/dashboard", response_model=DashboardOut)
def read_dashboard(session: DbSession, _: CurrentAdmin) -> dict:
    """Números agregados do sistema. Não inclui conteúdo de nenhuma conta."""
    return admin_service.dashboard_metrics(session)


@router.get("/accounts", response_model=AdminAccountPageOut)
def read_accounts(
    session: DbSession,
    _: CurrentAdmin,
    q: Annotated[str | None, Query(max_length=255)] = None,
    role: UserRole | None = None,
    limit: Limit = 25,
    offset: Offset = 0,
) -> AdminAccountPageOut:
    """Contas, com busca por e-mail ou nome e filtro por papel."""
    total, rows = admin_service.list_accounts(
        session, search=q, role=role, limit=limit, offset=offset
    )
    return AdminAccountPageOut(
        total=total, items=[AdminAccountOut.model_validate(row) for row in rows]
    )


@router.post("/accounts/{account_id}/suspend", response_model=AdminAccountOut)
def suspend_account(
    session: DbSession, admin: CurrentAdmin, account_id: uuid.UUID
) -> AdminAccountOut:
    """Suspende a conta: ela não entra e o token dela para de valer. Nada é apagado."""
    return AdminAccountOut.model_validate(
        admin_service.suspend_account(session, admin, account_id)
    )


@router.post("/accounts/{account_id}/reactivate", response_model=AdminAccountOut)
def reactivate_account(
    session: DbSession, admin: CurrentAdmin, account_id: uuid.UUID
) -> AdminAccountOut:
    """Desfaz a suspensão."""
    return AdminAccountOut.model_validate(
        admin_service.reactivate_account(session, admin, account_id)
    )


@router.delete("/accounts/{account_id}", response_model=DeletionReceiptOut)
def delete_account(
    session: DbSession, admin: CurrentAdmin, account_id: uuid.UUID
) -> DeletionReceiptOut:
    """Exclui a conta e os dados dela, sem volta, pela regra do `DELETE /auth/me`."""
    return admin_service.remove_account(session, admin, account_id)


@router.get("/actions", response_model=AdminActionPageOut)
def read_actions(
    session: DbSession, _: CurrentAdmin, limit: Limit = 25, offset: Offset = 0
) -> AdminActionPageOut:
    """Histórico das ações administrativas."""
    total, rows = admin_service.list_actions(session, limit=limit, offset=offset)
    return AdminActionPageOut(
        total=total,
        items=[
            AdminActionOut(
                id=row.action.id,
                action=row.action.action,
                target_role=row.action.target_role,
                created_at=row.action.created_at,
                actor_email=row.actor_email,
                target_email=row.target_email,
            )
            for row in rows
        ],
    )
