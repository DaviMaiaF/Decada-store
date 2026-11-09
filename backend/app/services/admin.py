"""Regras do painel do super usuário: métricas, contas e histórico.

O super usuário cuida do sistema, não lê dado de saúde (decisão 15). Tudo aqui conta
linhas ou lê identificação da conta; nenhuma consulta seleciona plano, item, despensa
ou lista além do `count`.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from enum import Enum

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    AdminAction,
    AdminActionType,
    Market,
    MealPlan,
    Payment,
    PaymentStatus,
    Prescription,
    PrescriptionStatus,
    PriceOrigin,
    PriceRecord,
    Product,
    Recipe,
    ShoppingList,
    User,
    UserRole,
)
from app.schemas.auth import DeletionReceiptOut
from app.services.accounts import delete_account
from app.services.pricing import RECENT_MAX_DAYS

SIGNUP_WEEKS = 8


class AccountNotFoundError(LookupError):
    """A conta pedida não existe."""


class ProtectedAccountError(ValueError):
    """Conta de super usuário não é suspensa nem excluída pelo painel."""


@dataclass(frozen=True)
class AccountRow:
    """Conta com as contagens que a listagem mostra."""

    user: User
    meal_plans_count: int
    prescriptions_count: int

    def __getattr__(self, name: str):
        # Deixa o schema de saída ler os campos da conta direto daqui.
        return getattr(self.user, name)


@dataclass(frozen=True)
class ActionRow:
    """Linha do histórico, com o e-mail de quem ainda tem conta."""

    action: AdminAction
    actor_email: str | None
    target_email: str | None


def _count(session: Session, model) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def _count_by(session: Session, column, enum_class: type[Enum]) -> dict[str, int]:
    """Contagem por valor do enum, com zero nos valores que não apareceram.

    A tela mostra sempre as mesmas categorias, em vez de uma sumir quando zera.
    """
    rows = session.execute(select(column, func.count()).group_by(column)).all()
    counts = {valor.value: quantidade for valor, quantidade in rows}
    return {membro.value: counts.get(membro.value, 0) for membro in enum_class}


def _signups_by_week(session: Session, now: datetime) -> list[dict]:
    """Cadastros por semana (segunda-feira, em UTC), incluindo as semanas zeradas."""
    this_week = now.date() - timedelta(days=now.weekday())
    weeks: list[date] = [
        this_week - timedelta(weeks=SIGNUP_WEEKS - 1 - i) for i in range(SIGNUP_WEEKS)
    ]
    start = datetime(weeks[0].year, weeks[0].month, weeks[0].day, tzinfo=timezone.utc)

    # Super usuário fica de fora: não é adesão ao app.
    week = func.date_trunc("week", func.timezone("UTC", User.created_at))
    rows = session.execute(
        select(week, func.count())
        .where(User.created_at >= start, User.role != UserRole.ADMIN)
        .group_by(week)
    ).all()
    counts = {inicio.date(): quantidade for inicio, quantidade in rows}

    return [{"week_start": semana, "count": counts.get(semana, 0)} for semana in weeks]


def dashboard_metrics(session: Session, now: datetime | None = None) -> dict:
    """Números agregados do sistema inteiro."""
    now = now or datetime.now(timezone.utc)
    # Mesma conta de `classify_confidence`, que olha dias inteiros: 30 dias e 12
    # horas ainda é recente. Antigo é a partir do 31º dia completo.
    is_stale = PriceRecord.collected_at <= now - timedelta(days=RECENT_MAX_DAYS + 1)

    regions = session.execute(
        select(
            PriceRecord.state_code,
            PriceRecord.city,
            func.count(),
            func.sum(case((is_stale, 1), else_=0)),
        )
        .group_by(PriceRecord.state_code, PriceRecord.city)
        .order_by(func.count().desc(), PriceRecord.state_code, PriceRecord.city)
    ).all()

    return {
        "generated_at": now,
        "accounts": {
            "total": _count(session, User),
            "suspended": session.scalar(
                select(func.count()).select_from(User).where(User.suspended_at.is_not(None))
            )
            or 0,
            "by_role": _count_by(session, User.role, UserRole),
            "signups_by_week": _signups_by_week(session, now),
        },
        "meal_plans": _count(session, MealPlan),
        "shopping_lists": _count(session, ShoppingList),
        "prescriptions": {
            "total": _count(session, Prescription),
            "by_status": _count_by(session, Prescription.status, PrescriptionStatus),
        },
        "payments": {
            "total": _count(session, Payment),
            "by_status": _count_by(session, Payment.status, PaymentStatus),
        },
        "prices": {
            "total": _count(session, PriceRecord),
            "stale": session.scalar(
                select(func.count()).select_from(PriceRecord).where(is_stale)
            )
            or 0,
            "by_origin": _count_by(session, PriceRecord.origin, PriceOrigin),
            "by_region": [
                {"state_code": uf, "city": cidade, "total": total, "stale": antigos}
                for uf, cidade, total, antigos in regions
            ],
        },
        "catalog": {
            "products": _count(session, Product),
            "markets": _count(session, Market),
            "recipes": _count(session, Recipe),
        },
    }


def list_accounts(
    session: Session,
    *,
    search: str | None = None,
    role: UserRole | None = None,
    limit: int = 25,
    offset: int = 0,
) -> tuple[int, list[AccountRow]]:
    """Contas mais recentes primeiro, com busca por e-mail ou nome."""
    filters = []
    if search:
        # autoescape: "%" digitado na busca é o caractere, não um curinga.
        filters.append(
            or_(
                User.email.icontains(search, autoescape=True),
                User.full_name.icontains(search, autoescape=True),
            )
        )
    if role is not None:
        filters.append(User.role == role)

    total = session.scalar(select(func.count()).select_from(User).where(*filters)) or 0

    plans = (
        select(func.count())
        .select_from(MealPlan)
        .where(MealPlan.user_id == User.id)
        .scalar_subquery()
    )
    prescriptions = (
        select(func.count())
        .select_from(Prescription)
        .where(Prescription.author_id == User.id)
        .scalar_subquery()
    )
    rows = session.execute(
        select(User, plans, prescriptions)
        .where(*filters)
        .order_by(User.created_at.desc(), User.email)
        .limit(limit)
        .offset(offset)
    ).all()

    return total, [AccountRow(*row) for row in rows]


def _get_manageable_account(session: Session, target_id: uuid.UUID) -> User:
    user = session.get(User, target_id)
    if user is None:
        raise AccountNotFoundError("não encontrado")
    # Vale para a própria conta e para outro super usuário: uma conta de
    # administração comprometida não consegue trancar as outras para fora.
    if user.role == UserRole.ADMIN:
        raise ProtectedAccountError("conta de super usuário não é alterada pelo painel")
    return user


def _account_row(session: Session, user: User) -> AccountRow:
    def count(model, column) -> int:
        return session.scalar(select(func.count()).select_from(model).where(column == user.id)) or 0

    return AccountRow(
        user,
        count(MealPlan, MealPlan.user_id),
        count(Prescription, Prescription.author_id),
    )


def suspend_account(session: Session, actor: User, target_id: uuid.UUID) -> AccountRow:
    """Suspende a conta. Em conta já suspensa não faz nada e não gera histórico."""
    user = _get_manageable_account(session, target_id)
    if user.suspended_at is None:
        user.suspended_at = datetime.now(timezone.utc)
        session.add(
            AdminAction(
                actor_id=actor.id,
                target_id=user.id,
                action=AdminActionType.CONTA_SUSPENSA,
                target_role=user.role,
            )
        )
        session.commit()
    return _account_row(session, user)


def reactivate_account(session: Session, actor: User, target_id: uuid.UUID) -> AccountRow:
    """Reativa a conta. Em conta que não está suspensa não faz nada."""
    user = _get_manageable_account(session, target_id)
    if user.suspended_at is not None:
        user.suspended_at = None
        session.add(
            AdminAction(
                actor_id=actor.id,
                target_id=user.id,
                action=AdminActionType.CONTA_REATIVADA,
                target_role=user.role,
            )
        )
        session.commit()
    return _account_row(session, user)


def remove_account(session: Session, actor: User, target_id: uuid.UUID) -> DeletionReceiptOut:
    """Exclui a conta pela mesma regra do `DELETE /auth/me`.

    O histórico registra que uma conta daquele papel foi excluída, sem dizer qual:
    `target_id` fica nulo aqui, e o `ON DELETE SET NULL` solta também as suspensões
    anteriores dela.
    """
    user = _get_manageable_account(session, target_id)
    target_role = user.role
    receipt = delete_account(session, user)
    session.add(
        AdminAction(
            actor_id=actor.id,
            target_id=None,
            action=AdminActionType.CONTA_EXCLUIDA,
            target_role=target_role,
        )
    )
    session.commit()
    return receipt


def list_actions(
    session: Session, *, limit: int = 25, offset: int = 0
) -> tuple[int, list[ActionRow]]:
    """Histórico, das ações mais recentes para as mais antigas."""
    total = _count(session, AdminAction)
    actions = session.scalars(
        select(AdminAction)
        .order_by(AdminAction.created_at.desc(), AdminAction.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return total, [
        ActionRow(
            action,
            action.actor.email if action.actor else None,
            action.target.email if action.target else None,
        )
        for action in actions
    ]
