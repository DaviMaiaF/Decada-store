"""Engine e sessão do SQLAlchemy."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# pool_pre_ping evita usar conexão derrubada pelo banco entre requisições.
engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """Dependência do FastAPI: uma sessão por requisição, sempre fechada ao fim."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
