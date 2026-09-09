"""Dependências compartilhadas pelas rotas."""

import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import User

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    session: DbSession,
    x_user_id: Annotated[
        uuid.UUID | None,
        Header(
            alias="X-User-Id",
            description=(
                "PROVISÓRIO — identifica o usuário até a autenticação existir "
                "(etapa 10). Depois disso o usuário virá do token e este "
                "cabeçalho deixa de ser lido."
            ),
        ),
    ] = None,
) -> User:
    """Usuário dono da requisição.

    Enquanto não há autenticação, ele vem de um cabeçalho. É o único ponto do
    código que sabe disso: a etapa 10 troca o corpo desta função por validação
    de token e nenhuma rota precisa mudar.

    Deliberadamente devolve 401 quando o cabeçalho falta ou aponta para alguém
    que não existe — a resposta é a mesma nos dois casos, para não confirmar
    quais identificadores existem no banco.
    """
    if x_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="informe o cabeçalho X-User-Id",
        )

    user = session.get(User, x_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="usuário não encontrado",
        )

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
