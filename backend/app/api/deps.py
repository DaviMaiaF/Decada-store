"""Dependências compartilhadas pelas rotas."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import User
from app.services.security import InvalidTokenError, read_access_token

DbSession = Annotated[Session, Depends(get_db)]

# auto_error=False para que a falta do cabeçalho vire o mesmo 401 do token
# inválido, em vez de um 403 do próprio FastAPI.
_bearer = HTTPBearer(auto_error=False, description="Token devolvido por /auth/login")


def get_current_user(
    session: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> User:
    """Usuário dono da requisição, a partir do token de acesso.

    Este é o único ponto do código que sabe como a autenticação funciona. Foi
    aqui que o cabeçalho provisório `X-User-Id` da etapa 9 vivia, e trocá-lo por
    validação de token não exigiu mudança em nenhuma rota de domínio.

    Token ausente, expirado, adulterado ou apontando para conta já excluída
    devolvem o mesmo 401. Distinguir os casos ajudaria mais quem está tentando
    adivinhar contas do que o dono da requisição — e conta excluída é
    exatamente o que a LGPD manda não confirmar.
    """
    negado = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="credenciais inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise negado

    try:
        user_id = read_access_token(credentials.credentials)
    except InvalidTokenError as erro:
        raise negado from erro

    user = session.get(User, user_id)
    if user is None:
        raise negado

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
