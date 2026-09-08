"""Ponto de entrada da API da DÉCADA."""

from fastapi import Depends, FastAPI

from app.core.config import Settings, get_settings

app = FastAPI(
    title="DÉCADA API",
    version="0.1.0",
    description=(
        "Traduz um plano alimentar prescrito em produtos de supermercado, "
        "estima o custo da compra e sugere receitas com os itens da lista."
    ),
)


@app.get("/health", tags=["infra"])
def health(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    """Verifica se a aplicação está no ar.

    Não consulta o banco de propósito: este endpoint precisa responder mesmo
    antes de existirem migrações. A checagem de conectividade com o Postgres
    entra quando houver engine (etapa 1).
    """
    return {"status": "ok", "app": settings.app_name, "env": settings.app_env}
