"""Planos que a nutricionista enviou ao paciente: ver, aceitar ou recusar."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentPatient, DbSession
from app.models import Prescription, PrescriptionMeal, PrescriptionStatus
from app.schemas.meal_plan import ImportResultOut
from app.schemas.prescription import ReceivedPrescriptionOut, ResponseIn
from app.services.prescriptions import (
    accept_prescription,
    decline_prescription,
    meal_structure,
    received_prescriptions,
)

router = APIRouter(prefix="/prescriptions/received", tags=["planos recebidos"])


def _get_received(session: DbSession, user: CurrentPatient, prescription_id: uuid.UUID):
    """Plano enviado a este paciente e ainda sem resposta, ou 404.

    Enviado a outro e-mail, já respondido ou inexistente dão o mesmo 404.
    """
    prescription = session.scalars(
        select(Prescription)
        .where(
            Prescription.id == prescription_id,
            Prescription.patient_email == user.email.lower(),
            Prescription.status == PrescriptionStatus.ENVIADA,
        )
        .options(
            selectinload(Prescription.author),
            selectinload(Prescription.meals).selectinload(PrescriptionMeal.items),
        )
    ).first()
    if prescription is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "plano não encontrado")
    return prescription


def _to_out(prescription: Prescription) -> ReceivedPrescriptionOut:
    return ReceivedPrescriptionOut.model_validate(
        {
            "id": prescription.id,
            "title": prescription.title,
            "notes": prescription.notes,
            "sent_at": prescription.sent_at,
            "author": prescription.author,
            "meals": [meal_structure(meal) for meal in prescription.meals],
        }
    )


@router.get("", response_model=list[ReceivedPrescriptionOut])
def read_received(session: DbSession, user: CurrentPatient) -> list[ReceivedPrescriptionOut]:
    """Planos enviados para o e-mail desta conta, esperando resposta.

    Vem inteiro, com refeições e substituições: é o que a pessoa lê antes de
    decidir aceitar.
    """
    return [_to_out(p) for p in received_prescriptions(session, user)]


@router.post(
    "/{prescription_id}/accept",
    response_model=ImportResultOut,
    status_code=status.HTTP_201_CREATED,
)
def accept(
    session: DbSession, user: CurrentPatient, prescription_id: uuid.UUID, payload: ResponseIn
) -> ImportResultOut:
    """Aceita o plano: ele vira o plano alimentar desta conta.

    Mesma regra do import por PDF: sem aceite do termo não há plano, e o
    horário do aceite é carimbado aqui, no servidor.
    """
    prescription = _get_received(session, user, prescription_id)
    if not payload.consent_accepted:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "sem aceite do termo não é possível guardar um plano alimentar",
        )

    result = accept_prescription(
        session, prescription, user, consent_at=datetime.now(timezone.utc)
    )
    session.commit()
    return ImportResultOut.model_validate(result)


@router.post("/{prescription_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline(session: DbSession, user: CurrentPatient, prescription_id: uuid.UUID) -> Response:
    """Recusa o plano. Nada é gravado na conta do paciente."""
    decline_prescription(session, _get_received(session, user, prescription_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
