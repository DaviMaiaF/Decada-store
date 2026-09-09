"""Configuração da aplicação, lida de variáveis de ambiente / arquivo .env."""

from functools import lru_cache
from pathlib import Path

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

    postgres_user: str = "decada"
    postgres_password: str = "decada"
    postgres_db: str = "decada"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    @property
    def database_url(self) -> str:
        """URL de conexão do SQLAlchemy (usada a partir da etapa 1)."""
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    """Instância única de Settings — o cache evita reler o .env a cada requisição."""
    return Settings()
