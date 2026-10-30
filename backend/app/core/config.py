"""Configuração da aplicação, lida de variáveis de ambiente / arquivo .env."""

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# O .env fica na raiz do repositório: backend/app/core/config.py -> sobe 3 níveis.
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    """Valores padrão servem apenas para desenvolvimento local.

    Em qualquer outro ambiente as variáveis precisam vir do ambiente real —
    nenhuma credencial de produção deve ser versionada aqui.
    """

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "decada"
    app_env: str = "dev"

    # Versão vigente do termo de consentimento (LGPD). Fica gravada em cada
    # plano alimentar: trocar o termo aqui não reescreve o que já foi aceito.
    consent_version: str = "v1"

    # Chave que assina os tokens. O padrão só serve para desenvolvimento:
    # em qualquer outro ambiente precisa vir do ambiente real, e trocá-la
    # invalida todos os tokens já emitidos.
    secret_key: str = "chave-de-desenvolvimento-nao-use-em-producao"
    access_token_expire_minutes: int = 60 * 24 * 7

    # Reconhecimento de alimentos na foto da despensa. Sem chave, a rota da foto
    # responde 503 e o resto do app continua funcionando. O Haiku é o modelo mais
    # barato com visão, e listar o que está numa prateleira não pede mais que isso.
    anthropic_api_key: str | None = None
    vision_model: str = "claude-haiku-5-5"

    postgres_user: str = "decada"
    postgres_password: str = "decada"
    postgres_db: str = "decada"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    # URL única de conexão, como Neon e Render entregam. Se existir, vence as
    # POSTGRES_* acima; se não, é montada a partir delas.
    database_url: str | None = None

    @model_validator(mode="after")
    def _resolve_database_url(self) -> "Settings":
        """Garante uma URL do SQLAlchemy com o driver psycopg (3)."""
        if self.database_url is None:
            self.database_url = (
                f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
                f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
            )
            return self

        # Os provedores entregam postgres:// ou postgresql://, que o SQLAlchemy
        # leria com o psycopg2 — driver que o projeto não instala.
        for prefix in ("postgres://", "postgresql://"):
            if self.database_url.startswith(prefix):
                self.database_url = "postgresql+psycopg://" + self.database_url[len(prefix):]
                break
        return self


@lru_cache
def get_settings() -> Settings:
    """Instância única de Settings — o cache evita reler o .env a cada requisição."""
    return Settings()
