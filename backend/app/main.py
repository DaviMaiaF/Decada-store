"""Ponto de entrada da API da DÉCADA."""

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_error_handlers
from app.api.routes import auth, meal_plans, pantry, products, recipes, shopping_lists
from app.core.config import Settings, get_settings

app = FastAPI(
    title="DÉCADA API",
    version="0.1.0",
    description=(
        "Traduz um plano alimentar prescrito em produtos de supermercado, "
        "estima o custo da compra e sugere receitas com os itens da lista.\n\n"
        "Cadastre-se em `/auth/register` ou entre em `/auth/login` e mande o "
        "token no cabeçalho `Authorization: Bearer <token>`. Para apagar todos "
        "os seus dados, `DELETE /auth/me`."
    ),
)

register_error_handlers(app)

# CORS existe só para a versão web do Expo, que roda em outra porta e por isso é
# bloqueada pelo navegador. O app nativo não precisa disto.
#
# Fica atrás de uma checagem de ambiente de propósito: liberar origem cruzada
# numa API que serve dado de saúde é decisão que precisa ser tomada de novo, com
# a lista de origens de verdade, se um dia isto for para produção.
if get_settings().app_env == "dev":
    app.add_middleware(
        CORSMiddleware,
        # Qualquer porta de localhost: o Expo troca de porta quando a 8081 está ocupada.
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router)
app.include_router(meal_plans.router)
app.include_router(shopping_lists.router)
app.include_router(pantry.router)
app.include_router(products.router)
app.include_router(recipes.router)


@app.get("/health", tags=["infra"])
def health(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    """Verifica se a aplicação está no ar.

    Não consulta o banco de propósito: este endpoint precisa responder mesmo
    antes de existirem migrações. A checagem de conectividade com o Postgres
    entra quando houver engine (etapa 1).
    """
    return {"status": "ok", "app": settings.app_name, "env": settings.app_env}
