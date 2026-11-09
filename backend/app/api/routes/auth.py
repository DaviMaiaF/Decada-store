"""Cadastro, login e conta — incluindo a exclusão de dados prevista na LGPD."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.models import User, UserRole
from app.schemas.auth import (
    DeletionReceiptOut,
    LoginIn,
    NutritionistRegisterIn,
    RegisterIn,
    TokenOut,
    UserOut,
)
from app.services.accounts import delete_account
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

    E-mail inexistente, senha errada, conta do outro papel e conta suspensa
    devolvem a mesma resposta de propósito: distinguir os casos entregaria de
    graça a lista de quem tem conta — e aqui ter conta de paciente significa ter
    um plano alimentar guardado.
    """
    user = session.scalars(select(User).where(User.email == payload.email.lower())).first()

    if (
        user is None
        or not verify_password(payload.password, user.password_hash)
        or user.role != role
        or user.suspended_at is not None
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "e-mail ou senha inválidos")

    expire_minutes = (
        get_settings().admin_token_expire_minutes if role == UserRole.ADMIN else None
    )
    return TokenOut(
        access_token=create_access_token(user.id, expire_minutes=expire_minutes),
        role=user.role,
    )


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


@router.post("/admin/login", response_model=TokenOut)
def login_admin(session: DbSession, payload: LoginIn) -> TokenOut:
    """Entrada do super usuário. Não existe cadastro público para este papel."""
    return _login(session, payload, UserRole.ADMIN)


@router.get("/me", response_model=UserOut)
def read_me(user: CurrentUser) -> User:
    """A conta de quem está autenticado."""
    return user


@router.delete("/me", response_model=DeletionReceiptOut)
def delete_me(session: DbSession, user: CurrentUser) -> DeletionReceiptOut:
    """Apaga a conta e todos os dados pessoais dela (LGPD, exclusão sob demanda).

    O que vai embora e o que fica está em `delete_account`.

    O token de quem foi excluído para de funcionar na requisição seguinte:
    `get_current_user` busca o usuário no banco e não vai mais encontrá-lo.
    """
    receipt = delete_account(session, user)
    session.commit()
    return receipt
