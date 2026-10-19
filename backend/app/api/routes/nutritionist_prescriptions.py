"""Planos alimentares da nutricionista: montar, editar, enviar e gerar o PDF."""

import uuid

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentNutritionist, DbSession
from app.models import Prescription, PrescriptionMeal
from app.schemas.prescription import (
    PrescriptionIn,
    PrescriptionOut,
    PrescriptionSummaryOut,
)
from app.services.prescriptions import (
    create_prescription,
    meal_structure,
    update_prescription,
)

router = APIRouter(prefix="/nutritionist/prescriptions", tags=["planos da nutricionista"])


def _get_prescription(
    session: DbSession, user: CurrentNutritionist, prescription_id: uuid.UUID
) -> Prescription:
    """Plano desta nutricionista, ou 404 — o de outra também é 404 (decisão 10)."""
    prescription = session.scalars(
        select(Prescription)
        .where(Prescription.id == prescription_id, Prescription.author_id == user.id)
        .options(selectinload(Prescription.meals).selectinload(PrescriptionMeal.items))
    ).first()
    if prescription is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "plano não encontrado")
    return prescription


def to_out(prescription: Prescription) -> PrescriptionOut:
    return PrescriptionOut.model_validate(
        {
            "id": prescription.id,
            "title": prescription.title,
            "patient_name": prescription.patient_name,
            "patient_email": prescription.patient_email,
            "notes": prescription.notes,
            "status": prescription.status,
            "sent_at": prescription.sent_at,
            "responded_at": prescription.responded_at,
            "created_at": prescription.created_at,
            "updated_at": prescription.updated_at,
            "meals": [meal_structure(meal) for meal in prescription.meals],
        }
    )


@router.get("", response_model=list[PrescriptionSummaryOut])
def read_prescriptions(session: DbSession, user: CurrentNutritionist) -> list:
    """Os planos desta nutricionista, do mexido mais recentemente ao mais antigo."""
    prescriptions = session.scalars(
        select(Prescription)
        .where(Prescription.author_id == user.id)
        .options(selectinload(Prescription.meals))
        .order_by(Prescription.updated_at.desc(), Prescription.created_at.desc())
    ).all()
    return [
        PrescriptionSummaryOut(
            id=p.id,
            title=p.title,
            patient_name=p.patient_name,
            patient_email=p.patient_email,
            status=p.status,
            sent_at=p.sent_at,
            updated_at=p.updated_at,
            meal_count=len(p.meals),
        )
        for p in prescriptions
    ]


@router.post("", response_model=PrescriptionOut, status_code=status.HTTP_201_CREATED)
def add_prescription(
    session: DbSession, user: CurrentNutritionist, payload: PrescriptionIn
) -> PrescriptionOut:
    """Cria o plano como rascunho. Ninguém o vê até ela enviar."""
    return to_out(create_prescription(session, user, payload))


@router.get("/{prescription_id}", response_model=PrescriptionOut)
def read_prescription(
    session: DbSession, user: CurrentNutritionist, prescription_id: uuid.UUID
) -> PrescriptionOut:
    return to_out(_get_prescription(session, user, prescription_id))


@router.put("/{prescription_id}", response_model=PrescriptionOut)
def replace_prescription(
    session: DbSession,
    user: CurrentNutritionist,
    prescription_id: uuid.UUID,
    payload: PrescriptionIn,
) -> PrescriptionOut:
    """Troca o plano inteiro. Plano já aceito pelo paciente responde 409."""
    prescription = _get_prescription(session, user, prescription_id)
    return to_out(update_prescription(session, prescription, payload))


@router.delete("/{prescription_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_prescription(
    session: DbSession, user: CurrentNutritionist, prescription_id: uuid.UUID
) -> Response:
    """Apaga o plano da nutricionista.

    Plano já aceito continua com o paciente: o que ele tem é uma cópia.
    """
    session.delete(_get_prescription(session, user, prescription_id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
