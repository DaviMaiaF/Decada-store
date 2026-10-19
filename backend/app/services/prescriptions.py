"""O plano alimentar que a nutricionista monta no app.

Regras que este módulo faz valer:
  - o plano aceito pelo paciente não muda mais: a cópia dele e o original não
    podem divergir em silêncio;
  - o documento é sempre renderizado nas mesmas linhas, aqui. O PDF gerado e o
    texto de auditoria do plano aceito (`MealPlan.source_text`) saem da mesma
    função, então o que o paciente aceitou é exatamente o que o PDF diz.

O formato das linhas é o do Dietbox, que o import já lê (decisão 7):

    08:30 - Café da manhã
    Pão francês - 50 g - 1 unidade média
    Orientação: ...
    Substituição 1
    Tapioca - 35 g - 2 colheres de sopa

A quantidade de compra vem antes da medida caseira porque o import fica com a
primeira medida de massa ou volume da linha. As substituições vêm depois dos
itens principais: o import descarta o bloco "Substituição N" até a refeição
seguinte, e é isso que as mantém fora da lista de compras.
"""

from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Prescription, PrescriptionItem, PrescriptionMeal, User
from app.models.enums import MeasurementUnit, PrescriptionStatus
from app.schemas.prescription import PrescriptionIn, PrescriptionItemIn

# Prefixo que o import reconhece como bloco de orientação, até a próxima
# substituição ou refeição. Sem ele, uma orientação curta viraria item.
ORIENTATION_PREFIX = "Orientação:"


class PrescriptionLockedError(ValueError):
    """Tentativa de mudar um plano que o paciente já aceitou."""


def _item(item: PrescriptionItemIn, option: int, position: int) -> PrescriptionItem:
    return PrescriptionItem(
        option=option,
        position=position,
        food=item.food,
        household_measure=item.household_measure,
        quantity=item.quantity,
        unit=item.unit,
    )


def _meals(payload: PrescriptionIn) -> list[PrescriptionMeal]:
    meals = []
    for position, meal in enumerate(payload.meals, start=1):
        items = [_item(item, 0, i) for i, item in enumerate(meal.items, start=1)]
        for option, substitution in enumerate(meal.substitutions, start=1):
            items += [_item(item, option, i) for i, item in enumerate(substitution, start=1)]
        meals.append(
            PrescriptionMeal(
                position=position,
                name=meal.name,
                time=meal.time,
                notes=meal.notes,
                items=items,
            )
        )
    return meals


def ensure_editable(prescription: Prescription) -> None:
    if prescription.status is PrescriptionStatus.ACEITA:
        raise PrescriptionLockedError(
            "o paciente já aceitou este plano; para mudar, crie um plano novo"
        )


def create_prescription(session: Session, author: User, payload: PrescriptionIn) -> Prescription:
    prescription = Prescription(
        author=author,
        title=payload.title,
        patient_name=payload.patient_name,
        notes=payload.notes,
        meals=_meals(payload),
    )
    session.add(prescription)
    session.commit()
    session.refresh(prescription)
    return prescription


def update_prescription(
    session: Session, prescription: Prescription, payload: PrescriptionIn
) -> Prescription:
    """Troca o plano inteiro pelo que veio.

    Editar um plano já enviado continua permitido: o paciente ainda não
    respondeu, e o que ele vai ler é a versão de agora.
    """
    ensure_editable(prescription)

    prescription.title = payload.title
    prescription.patient_name = payload.patient_name
    prescription.notes = payload.notes

    # Os antigos saem antes dos novos: na mesma descarga o Postgres veria duas
    # refeições na mesma posição e recusaria pela unicidade.
    prescription.meals.clear()
    session.flush()
    prescription.meals.extend(_meals(payload))

    session.commit()
    session.refresh(prescription)
    return prescription


# --- estrutura e texto do documento ---


def _item_structure(item: PrescriptionItem) -> dict:
    return {
        "food": item.food,
        "household_measure": item.household_measure,
        "quantity": str(item.quantity),
        "unit": item.unit.value,
    }


def meal_structure(meal: PrescriptionMeal) -> dict:
    """A refeição como a API e a cópia do paciente a guardam: tudo serializável."""
    options: dict[int, list[dict]] = {}
    for item in meal.items:
        options.setdefault(item.option, []).append(_item_structure(item))
    return {
        "name": meal.name,
        "time": meal.time.strftime("%H:%M"),
        "notes": meal.notes,
        "items": options.pop(0, []),
        "substitutions": [options[option] for option in sorted(options)],
    }


def prescription_structure(prescription: Prescription) -> dict:
    return {
        "notes": prescription.notes,
        "meals": [meal_structure(meal) for meal in prescription.meals],
    }


def _amount(quantity: Decimal, unit: MeasurementUnit) -> str:
    """150 g, 1,5 kg, 2 unidades — como o import lê e como se escreve."""
    numero = format(quantity.normalize(), "f").replace(".", ",")
    if unit is MeasurementUnit.UNIDADE:
        return f"{numero} {'unidade' if quantity == 1 else 'unidades'}"
    return f"{numero} {unit.value}"


def item_line(item: PrescriptionItem) -> str:
    partes = [item.food, _amount(item.quantity, item.unit)]
    if item.household_measure:
        partes.append(item.household_measure)
    return " - ".join(partes)


def _orientation_lines(text: str) -> list[str]:
    """A orientação em linhas, a primeira com o prefixo que o import reconhece."""
    paragrafos = [linha.strip() for linha in text.splitlines() if linha.strip()]
    if not paragrafos:
        return []
    return [f"{ORIENTATION_PREFIX} {paragrafos[0]}", *paragrafos[1:]]


def prescription_lines(prescription: Prescription, author: User) -> list[str]:
    """O documento inteiro, uma linha por linha do PDF."""
    lines = [author.full_name or "Nutricionista"]
    if author.crn:
        # O import descarta "CRN" como identificação do profissional.
        lines.append(f"CRN: {author.crn.removeprefix('CRN').lstrip(':- ')}")
    lines.append("Plano Alimentar")
    if prescription.title:
        lines.append(prescription.title)
    if prescription.patient_name:
        lines.append(prescription.patient_name)

    for meal in prescription.meals:
        lines.append(f"{meal.time.strftime('%H:%M')} - {meal.name}")
        principais = [item for item in meal.items if item.option == 0]
        lines += [item_line(item) for item in principais]
        if meal.notes:
            lines += _orientation_lines(meal.notes)

        opcoes = sorted({item.option for item in meal.items if item.option > 0})
        for numero, option in enumerate(opcoes, start=1):
            lines.append(f"Substituição {numero}")
            lines += [item_line(item) for item in meal.items if item.option == option]

    if prescription.notes:
        # A orientação geral vem num bloco próprio, depois da última refeição.
        lines.append("Orientações gerais:")
        lines += _orientation_lines(prescription.notes)

    return lines
