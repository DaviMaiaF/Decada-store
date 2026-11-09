"""Testes da página do painel: o que protege o token do super usuário no navegador.

Não precisam de banco. O comportamento da tela é conferido no navegador; aqui fica o
que pode quebrar em silêncio numa mudança futura.
"""

import re

import pytest
from fastapi.testclient import TestClient

from app.api.routes.admin_web import VERSIONED_ASSETS, WEB_DIR, asset_version
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
        ("theme.js", "javascript"),
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
    # Atualizar o painel não pode deixar o navegador com o CSS ou o JS antigo.
    assert resposta.headers["cache-control"] == "no-cache"


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


def test_o_tema_guarda_so_a_escolha_do_tema():
    # O único arquivo que usa o armazenamento do navegador não pode tocar no token.
    js = (WEB_DIR / "theme.js").read_text()

    assert "localStorage" in js
    for proibido in ("token", "Authorization", "fetch", "sessionStorage", "document.cookie"):
        assert proibido not in js, proibido


def test_o_botao_de_tema_fica_so_no_painel_e_sem_texto():
    # Texto que muda de largura a cada clique fazia o botão mudar de tamanho.
    html = (WEB_DIR / "index.html").read_text()
    login = html[html.index('id="login"') : html.index('id="app"')]

    assert "data-theme-toggle" not in login
    assert html.count("data-theme-toggle") == 1
    assert "theme-label" not in html


def test_o_tema_e_aplicado_antes_do_primeiro_desenho():
    # Com defer, ou depois do CSS, a página piscaria no tema errado ao abrir.
    html = (WEB_DIR / "index.html").read_text()
    head = html[: html.index("</head>")]

    assert re.search(r'<script src="/admin/static/theme\.js"></script>', head)
    assert head.index("theme.js") < head.index("admin.css")


@pytest.mark.parametrize("arquivo", VERSIONED_ASSETS)
def test_a_pagina_cita_cada_arquivo_com_a_versao_do_conteudo(client, arquivo):
    # Endereço novo a cada mudança: o navegador não reaproveita o arquivo antigo do cache.
    html = client.get("/admin").text
    endereco = f"/admin/static/{arquivo}?v={asset_version(arquivo)}"

    assert f'"{endereco}"' in html
    assert f'"/admin/static/{arquivo}"' not in html
    assert client.get(endereco).status_code == 200


def test_a_versao_muda_quando_o_arquivo_muda(tmp_path, monkeypatch):
    from app.api.routes import admin_web

    (tmp_path / "admin.css").write_text("body { color: red; }")
    monkeypatch.setattr(admin_web, "WEB_DIR", tmp_path)
    antes = admin_web.asset_version("admin.css")

    (tmp_path / "admin.css").write_text("body { color: blue; }")

    assert admin_web.asset_version("admin.css") != antes


def test_o_icone_do_tema_e_trocado_pelo_atributo():
    # Ícone é SVG: `icon.hidden = ...` não mexe no atributo e o botão ficava vazio.
    js = (WEB_DIR / "theme.js").read_text()

    assert 'toggleAttribute("hidden"' in js
    assert "icon.hidden =" not in js
