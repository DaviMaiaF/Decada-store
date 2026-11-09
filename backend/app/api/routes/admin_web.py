"""Páginas do painel do super usuário, servidas pela própria API.

Mesma origem da API, de propósito: não exige liberar CORS numa API que serve dado de
saúde (ver `main.py`), e o merge na `main` publica o painel junto.

A página em si não é segredo e não traz dado nenhum: tudo vem depois do login, pelas
rotas de `routes/admin.py`.
"""

import hashlib
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
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


# Arquivos citados no HTML com a versão no endereço (`admin.css?v=...`). A versão sai do
# conteúdo: mudou o arquivo, mudou o endereço, e o navegador baixa o novo mesmo que ainda
# tenha o antigo guardado. Sem isto, uma atualização do painel chegava com o CSS velho.
VERSIONED_ASSETS = ("admin.css", "admin.js", "theme.js")

PAGE_HEADERS = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
}


def asset_version(name: str) -> str:
    """Doze caracteres do SHA-256 do arquivo: curto, e muda a qualquer edição."""
    return hashlib.sha256((WEB_DIR / name).read_bytes()).hexdigest()[:12]


def render_index() -> str:
    """O index.html com cada arquivo versionado apontando para a versão atual."""
    html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    for name in VERSIONED_ASSETS:
        html = html.replace(
            f'"/admin/static/{name}"', f'"/admin/static/{name}?v={asset_version(name)}"'
        )
    return html


@router.get("/admin")
def admin_page() -> HTMLResponse:
    # A página não é guardada (no-store), então sempre chega com as versões atuais.
    return HTMLResponse(render_index(), headers=PAGE_HEADERS)


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
