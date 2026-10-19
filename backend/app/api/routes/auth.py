"""Cadastro, login e conta — incluindo a exclusão de dados prevista na LGPD."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select, update

from app.api.deps import CurrentUser, DbSession
from app.models import (
    MealPlan,
    PantryItem,
    Prescription,
    PriceRecord,
    ShoppingList,
    User,
    UserRole,
)
from app.schemas.auth import (
    DeletionReceiptOut,
    LoginIn,
    NutritionistRegisterIn,
    RegisterIn,
    TokenOut,
    UserOut,
)
from app.services.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["conta"])


def _create_account(session: DbSession, user: User) -> TokenOut:
    """Grava a conta e devolve o token, para o app não pedir a senha duas vezes."""
    if session.scalars(select(User).where(User.email == user.email)).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "já existe uma conta com este e-mail")

    session.add(user)
    session.commit()
    session.refresh(user)

    return TokenOut(access_token=create_access_token(user.id), role=user.role)


def _login(session: DbSession, payload: LoginIn, role: UserRole) -> TokenOut:
    """Troca e-mail e senha por um token, se a conta for do papel desta porta.

    E-mail inexistente, senha errada e conta do outro papel devolvem a mesma
    resposta de propósito: distinguir os casos entregaria de graça a lista de
    quem tem conta — e aqui ter conta de paciente significa ter um plano
    alimentar guardado.
    """
    user = session.scalars(select(User).where(User.email == payload.email.lower())).first()

    if (
        user is None
        or not verify_password(payload.password, user.password_hash)
        or user.role != role
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "e-mail ou senha inválidos")

    return TokenOut(access_token=create_access_token(user.id), role=user.role)


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(session: DbSession, payload: RegisterIn) -> TokenOut:
    """Cria a conta de paciente."""
    return _create_account(
        session,
        User(
            email=payload.email.lower(),
            password_hash=hash_password(payload.password),
            full_name=payload.full_name,
            role=UserRole.PACIENTE,
        ),
    )


@router.post("/login", response_model=TokenOut)
def login(session: DbSession, payload: LoginIn) -> TokenOut:
    """Entrada do paciente."""
    return _login(session, payload, UserRole.PACIENTE)


@router.post(
    "/nutritionist/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED
)
def register_nutritionist(session: DbSession, payload: NutritionistRegisterIn) -> TokenOut:
    """Cria a conta de nutricionista, com nome e CRN obrigatórios."""
    return _create_account(
        session,
        User(
            email=payload.email.lower(),
            password_hash=hash_password(payload.password),
            full_name=payload.full_name,
            role=UserRole.NUTRICIONISTA,
            crn=payload.crn,
        ),
    )


@router.post("/nutritionist/login", response_model=TokenOut)
def login_nutritionist(session: DbSession, payload: LoginIn) -> TokenOut:
    """Entrada da nutricionista. Conta de paciente não passa por aqui."""
    return _login(session, payload, UserRole.NUTRICIONISTA)


@router.get("/me", response_model=UserOut)
def read_me(user: CurrentUser) -> User:
    """A conta de quem está autenticado."""
    return user


@router.delete("/me", response_model=DeletionReceiptOut)
def delete_me(session: DbSession, user: CurrentUser) -> DeletionReceiptOut:
    """Apaga a conta e todos os dados pessoais dela (LGPD, exclusão sob demanda).

    Vão embora: a conta, os planos alimentares com seus itens, a despensa, as
    listas de compras e, da nutricionista, os planos que ela montou — por
    cascata declarada no modelo. O plano que um paciente já aceitou fica com
    ele: é uma cópia, e é dado dele.

    Ficam: os registros de preço que a pessoa contribuiu, com `user_id` nulo.
    Preço coletado de nota fiscal é informação sobre o mercado, não sobre quem
    passou no caixa; anonimizado, ele deixa de ser dado pessoal e continua
    servindo a média da região.

    O token de quem foi excluído para de funcionar na requisição seguinte:
    `get_current_user` busca o usuário no banco e não vai mais encontrá-lo.
    """
    counts = {
        "meal_plans": session.scalar(
            select(func.count()).select_from(MealPlan).where(MealPlan.user_id == user.id)
        )
        or 0,
        "pantry_items": session.scalar(
            select(func.count()).select_from(PantryItem).where(PantryItem.user_id == user.id)
        )
        or 0,
        "shopping_lists": session.scalar(
            select(func.count())
            .select_from(ShoppingList)
            .join(MealPlan)
            .where(MealPlan.user_id == user.id)
        )
        or 0,
        "prescriptions": session.scalar(
            select(func.count())
            .select_from(Prescription)
            .where(Prescription.author_id == user.id)
        )
        or 0,
        "price_records": session.scalar(
            select(func.count()).select_from(PriceRecord).where(PriceRecord.user_id == user.id)
        )
        or 0,
    }

    # Feito à mão, e não pelo ON DELETE SET NULL, para que o desvínculo aconteça
    # antes de a linha sumir e possa ser contado no comprovante.
    session.execute(
        update(PriceRecord).where(PriceRecord.user_id == user.id).values(user_id=None)
    )
    session.delete(user)
    session.commit()

    return DeletionReceiptOut(
        deleted_at=datetime.now(timezone.utc),
        meal_plans_deleted=counts["meal_plans"],
        pantry_items_deleted=counts["pantry_items"],
        shopping_lists_deleted=counts["shopping_lists"],
        prescriptions_deleted=counts["prescriptions"],
        price_records_anonymized=counts["price_records"],
    )
