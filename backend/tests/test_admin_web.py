"""Testes da página do painel: o que protege o token do super usuário no navegador.

Não precisam de banco. O comportamento da tela é conferido no navegador; aqui fica o
que pode quebrar em silêncio numa mudança futura.
"""

import re

import pytest
from fastapi.testclient import TestClient

from app.api.routes.admin_web import WEB_DIR
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_a_pagina_abre_sem_login_e_nao_traz_dado(client):
    resposta = client.get("/admin")

    assert resposta.status_code == 200
    assert "text/html" in resposta.headers["content-type"]
    assert "@" not in resposta.text


def test_a_pagina_so_roda_script_do_proprio_servidor(client):
    politica = client.get("/admin").headers["content-security-policy"]

    assert "script-src 'self'" in politica
    assert "frame-ancestors 'none'" in politica
    assert "unsafe" not in politica


def test_a_pagina_nao_fica_em_cache_nem_vaza_a_origem(client):
    cabecalhos = client.get("/admin").headers

    assert cabecalhos["cache-control"] == "no-store"
    assert cabecalhos["referrer-policy"] == "no-referrer"


@pytest.mark.parametrize(
    ("arquivo", "tipo"),
    [
        ("admin.js", "javascript"),
        ("admin.css", "text/css"),
        ("favicon.svg", "image/svg+xml"),
        ("fonts/PlusJakartaSans_400Regular.ttf", "font"),
        ("fonts/PlusJakartaSans_700Bold.ttf", "font"),
    ],
)
def test_serve_os_arquivos_da_pagina(client, arquivo, tipo):
    resposta = client.get(f"/admin/static/{arquivo}")

    assert resposta.status_code == 200
    assert tipo in resposta.headers["content-type"]
    assert resposta.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize(
    "caminho",
    ["/admin/static/../main.py", "/admin/static/%2e%2e/main.py", "/admin/static/nada.js"],
)
def test_nao_serve_nada_fora_da_pasta_do_painel(client, caminho):
    assert client.get(caminho).status_code == 404


def test_o_html_nao_tem_script_nem_estilo_embutido():
    # A CSP bloquearia os dois: a tela apareceria quebrada só no navegador.
    html = (WEB_DIR / "index.html").read_text()

    assert not re.search(r"<script(?![^>]*\bsrc=)", html)
    assert "<style" not in html
    assert not re.search(r"\sstyle=", html)
    assert not re.search(r"\son[a-z]+=", html)


def test_dado_da_api_nunca_vira_html():
    # Nome e e-mail vêm do cadastro público e a página roda com o token que alcança
    # todas as contas: um nome com <script> não pode executar.
    js = (WEB_DIR / "admin.js").read_text()

    for proibido in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("):
        assert proibido not in js, proibido


def test_o_token_nao_fica_guardado_no_navegador():
    js = (WEB_DIR / "admin.js").read_text()

    for proibido in ("localStorage", "sessionStorage", "document.cookie", "indexedDB"):
        assert proibido not in js, proibido
