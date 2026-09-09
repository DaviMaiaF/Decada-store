"""Rotas do plano alimentar: import por PDF, consulta e confirmação do casamento."""

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.models import MealPlan, PlanItem, Product
from app.models.enums import PlanItemStatus
from app.schemas.meal_plan import (
    CandidateOut,
    ConfirmationIn,
    ImportResultOut,
    MealPlanOut,
    PlanItemOut,
)
from app.services.import_plan import import_plan_from_pdf
from app.services.matching import find_candidates
from app.services.parsing import parse_item_line

router = APIRouter(prefix="/meal-plans", tags=["planos alimentares"])


def _get_plan(session: DbSession, user: CurrentUser, plan_id: uuid.UUID) -> MealPlan:
    """Plano do usuário, ou 404.

    Plano de outra pessoa também devolve 404, e não 403: dizer "existe, mas não
    é seu" já vazaria a informação de que aquela pessoa tem um plano alimentar.
    """
    plan = session.scalars(
        select(MealPlan)
        .where(MealPlan.id == plan_id, MealPlan.user_id == user.id)
        .options(selectinload(MealPlan.items))
    ).first()

    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "plano alimentar não encontrado")
    return plan


def _get_item(plan: MealPlan, item_id: uuid.UUID) -> PlanItem:
    for item in plan.items:
        if item.id == item_id:
            return item
    raise HTTPException(status.HTTP_404_NOT_FOUND, "item não encontrado neste plano")


@router.post("", response_model=ImportResultOut, status_code=status.HTTP_201_CREATED)
def import_meal_plan(
    session: DbSession,
    user: CurrentUser,
    file: Annotated[UploadFile, File(description="PDF do plano alimentar, com texto")],
    consent_accepted: Annotated[
        bool,
        Form(description="Aceite explícito do termo de tratamento de dado de saúde (LGPD)"),
    ],
    title: Annotated[str | None, Form()] = None,
    nutritionist_name: Annotated[str | None, Form()] = None,
) -> ImportResultOut:
    """Importa o plano alimentar a partir do PDF entregue pela nutricionista.

    O aceite é obrigatório e o horário dele é carimbado aqui, no servidor:
    aceitar o horário informado pelo cliente seria usar como prova de
    consentimento um dado que o cliente controla.

    PDF digitalizado é recusado com 422 — OCR está fora desta versão.
    """
    if not consent_accepted:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "sem aceite do termo não é possível guardar um plano alimentar",
        )

    result = import_plan_from_pdf(
        session,
        user,
        file.file.read(),
        consent_at=datetime.now(timezone.utc),
        title=title,
        nutritionist_name=nutritionist_name,
    )
    session.commit()
    return ImportResultOut.model_validate(result)


@router.get("/{plan_id}", response_model=MealPlanOut)
def read_meal_plan(session: DbSession, user: CurrentUser, plan_id: uuid.UUID) -> MealPlan:
    """O plano alimentar com seus itens, na ordem em que vieram do PDF."""
    return _get_plan(session, user, plan_id)


@router.get("/{plan_id}/items/{item_id}/candidates", response_model=list[CandidateOut])
def read_candidates(
    session: DbSession,
    user: CurrentUser,
    plan_id: uuid.UUID,
    item_id: uuid.UUID,
) -> list:
    """Produtos do catálogo que podem atender ao item, do mais parecido ao menos.

    Só sugere. Quem escolhe é o usuário, pela rota de confirmação.
    """
    plan = _get_plan(session, user, plan_id)
    item = _get_item(plan, item_id)

    catalog = session.scalars(select(Product)).all()
    description = parse_item_line(item.raw_description).description
    return find_candidates(description, item.quantity, item.unit, catalog)


@router.post("/{plan_id}/items/{item_id}/confirmation", response_model=PlanItemOut)
def confirm_item(
    session: DbSession,
    user: CurrentUser,
    plan_id: uuid.UUID,
    item_id: uuid.UUID,
    confirmation: ConfirmationIn,
) -> PlanItem:
    """Confirma qual produto atende ao item do plano.

    É este ato que libera o item para a lista de compras: a geração só olha
    para itens confirmados.
    """
    plan = _get_plan(session, user, plan_id)
    item = _get_item(plan, item_id)

    product = session.get(Product, confirmation.product_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "produto não encontrado")

    item.product_id = product.id
    item.match_score = confirmation.match_score
    item.status = PlanItemStatus.CONFIRMADO
    session.commit()
    session.refresh(item)
    return item
