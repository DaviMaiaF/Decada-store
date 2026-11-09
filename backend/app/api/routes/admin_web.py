"""Páginas do painel do super usuário, servidas pela própria API.

Mesma origem da API, de propósito: não exige liberar CORS numa API que serve dado de
saúde (ver `main.py`), e o merge na `main` publica o painel junto.

A página em si não é segredo e não traz dado nenhum: tudo vem depois do login, pelas
rotas de `routes/admin.py`.
"""

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.types import Scope

WEB_DIR = Path(__file__).resolve().parents[2] / "admin_web"

# Barreira contra script injetado: só roda o que vem deste servidor. A página nunca é
# embutida em outra (clickjacking num botão de excluir conta) e não manda formulário
# para fora; o login é feito por fetch, dentro de connect-src.
CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self'",
        "font-src 'self'",
        "img-src 'self'",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
    ]
)

router = APIRouter(include_in_schema=False)


@router.get("/admin")
def admin_page() -> FileResponse:
    return FileResponse(
        WEB_DIR / "index.html",
        headers={
            "Content-Security-Policy": CONTENT_SECURITY_POLICY,
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )


class AdminStaticFiles(StaticFiles):
    """Arquivos do painel: sem adivinhar o tipo, e sempre conferidos antes de usar."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        response.headers["X-Content-Type-Options"] = "nosniff"
        # O navegador pode guardar, mas confere a cada abertura (responde 304 se nada
        # mudou). Sem isto, a página nova chegava com o CSS velho do cache.
        response.headers["Cache-Control"] = "no-cache"
        return response


admin_static = AdminStaticFiles(directory=WEB_DIR)
