"""Cadastro, login e conta — incluindo a exclusão de dados prevista na LGPD."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select, update

from app.api.deps import CurrentUser, DbSession
from app.models import MealPlan, PantryItem, PriceRecord, ShoppingList, User
from app.schemas.auth import DeletionReceiptOut, LoginIn, RegisterIn, TokenOut, UserOut
from app.services.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["conta"])


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(session: DbSession, payload: RegisterIn) -> TokenOut:
    """Cria a conta e já devolve o token, para o app não pedir a senha duas vezes."""
    email = payload.email.lower()

    if session.scalars(select(User).where(User.email == email)).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "já existe uma conta com este e-mail")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return TokenOut(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenOut)
def login(session: DbSession, payload: LoginIn) -> TokenOut:
    """Troca e-mail e senha por um token de acesso.

    E-mail inexistente e senha errada devolvem a mesma resposta de propósito:
    distinguir os dois casos entregaria de graça a lista de quem tem conta —
    e aqui ter conta significa ter um plano alimentar guardado.
    """
    user = session.scalars(select(User).where(User.email == payload.email.lower())).first()

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "e-mail ou senha inválidos")

    return TokenOut(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def read_me(user: CurrentUser) -> User:
    """A conta de quem está autenticado."""
    return user


@router.delete("/me", response_model=DeletionReceiptOut)
def delete_me(session: DbSession, user: CurrentUser) -> DeletionReceiptOut:
    """Apaga a conta e todos os dados pessoais dela (LGPD, exclusão sob demanda).

    Vão embora: a conta, os planos alimentares com seus itens, a despensa e as
    listas de compras — por cascata declarada no modelo.

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
        price_records_anonymized=counts["price_records"],
    )
