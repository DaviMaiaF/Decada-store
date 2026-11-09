"""Criação da conta de super usuário.

Fica fora da API de propósito: uma rota de cadastro desse papel seria o alvo mais
valioso do sistema. Quem cria a conta precisa ter acesso ao banco.
"""

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User, UserRole
from app.services.security import MAX_PASSWORD_BYTES, hash_password

# Mais que os 8 caracteres do app: esta senha alcança todas as contas.
MINIMUM_SUPERUSER_PASSWORD_LENGTH = 12


class SuperuserError(ValueError):
    """Motivo, em português, de a conta não poder ser criada."""


def create_superuser(
    session: Session, email: str, password: str, full_name: str | None = None
) -> User:
    """Cria o super usuário, sem nunca promover uma conta que já existe.

    Uma conta tem um papel só. Promover um paciente daria ao super usuário um plano
    alimentar, e a exclusão de uma das metades ficaria sem resposta clara.
    """
    try:
        email = validate_email(email, check_deliverability=False).normalized.lower()
    except EmailNotValidError as erro:
        raise SuperuserError(f"e-mail inválido: {erro}") from erro

    if len(password) < MINIMUM_SUPERUSER_PASSWORD_LENGTH:
        raise SuperuserError(
            f"a senha precisa de ao menos {MINIMUM_SUPERUSER_PASSWORD_LENGTH} caracteres"
        )
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        raise SuperuserError(f"a senha passa do limite de {MAX_PASSWORD_BYTES} bytes do bcrypt")

    if session.scalars(select(User).where(User.email == email)).first() is not None:
        raise SuperuserError("já existe uma conta com este e-mail")

    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        role=UserRole.ADMIN,
    )
    session.add(user)
    session.commit()
    return user
