"""Senha e token de acesso.

Duas responsabilidades: guardar senha de um jeito que não dê para desfazer e
emitir um token que prove quem é o dono da requisição.

Senha nunca é guardada, nem cifrada: o que vai para o banco é um hash bcrypt,
que não tem caminho de volta. Nem o time do projeto consegue ler a senha de
alguém, e é assim que tem que ser.
"""

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import get_settings

ALGORITHM = "HS256"

# bcrypt trunca em 72 bytes e, da versão 5 em diante, levanta erro em vez de
# cortar em silêncio. O limite é checado aqui para virar mensagem de validação.
MAX_PASSWORD_BYTES = 72

MINIMUM_PASSWORD_LENGTH = 8


class InvalidTokenError(ValueError):
    """Token ausente, expirado, adulterado ou sem o dono dentro."""


def hash_password(password: str) -> str:
    """Hash bcrypt da senha, com sal próprio gerado a cada chamada."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Confere a senha contra o hash guardado.

    Devolve False em vez de levantar quando o hash está corrompido: quem chama
    trata os dois casos do mesmo jeito, negando o acesso.
    """
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_access_token(user_id: uuid.UUID, *, issued_at: datetime | None = None) -> str:
    """Token assinado que identifica o usuário até expirar."""
    settings = get_settings()
    now = issued_at or datetime.now(timezone.utc)

    return jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
        },
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def read_access_token(token: str) -> uuid.UUID:
    """Id do usuário guardado no token.

    Levanta `InvalidTokenError` para qualquer problema — expirado, assinatura
    errada, formato inválido —, sem distinguir os casos: dizer *qual* foi o
    problema ajudaria mais quem está tentando forjar um token do que o usuário.
    """
    settings = get_settings()

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError) as erro:
        raise InvalidTokenError("token inválido ou expirado") from erro
