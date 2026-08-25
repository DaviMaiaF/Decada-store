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

    app_name: str = "nutricart"
    app_env: str = "dev"

    postgres_user: str = "nutricart"
    postgres_password: str = "nutricart"
    postgres_db: str = "nutricart"
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
