"""Testes do PDF do plano montado pela nutricionista.

O teste que importa é a ida e volta: o PDF gerado, importado pelo paciente pelo
caminho de sempre (decisão 7), tem de render os mesmos itens que o aceite por
e-mail rende — nem a substituição nem a orientação podem virar item de compra,
e nenhum item principal pode sumir.
"""

import pytest

from app.services.import_plan import _discard_reasons
from app.services.pdf import extract_lines
from app.services.pdf_writer import Line, write_pdf
from tests.helpers import auth_headers, plano_da_nutricionista

pytestmark = pytest.mark.db

ROTA = "/nutritionist/prescriptions"

ORIENTACAO_LONGA = (
    "Esse lanche é para evitar longos períodos em jejum, equilibrar a saciedade durante "
    "o dia e inserir os nutrientes e fibras necessários. Prefira frutas da estação e "
    "varie as cores ao longo da semana."
)


def _pdf(client, autora, corpo: dict) -> bytes:
    criado = client.post(ROTA, json=corpo, headers=auth_headers(autora)).json()
    resposta = client.get(f"{ROTA}/{criado['id']}/pdf", headers=auth_headers(autora))
    assert resposta.status_code == 200, resposta.text
    assert resposta.headers["content-type"] == "application/pdf"
    return resposta.content


def _importar(client, paciente, pdf: bytes) -> dict:
    resposta = client.post(
        "/meal-plans",
        files={"file": ("plano.pdf", pdf, "application/pdf")},
        data={"consent_accepted": "true"},
        headers=auth_headers(paciente),
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def _itens(importado: dict) -> list[tuple[str, str, str]]:
    return [
        (i["raw_description"].split(" - ")[0], i["quantity"], i["unit"])
        for i in importado["meal_plan"]["items"]
    ]


# --------------------------------------------------------------------------
# escrita do PDF — sem banco
# --------------------------------------------------------------------------

def test_o_pdf_escrito_tem_texto_que_o_import_le():
    pdf = write_pdf([Line("Plano Alimentar", bold=True), Line("Arroz - 150 g")])

    assert extract_lines(pdf) == ["Plano Alimentar", "Arroz - 150 g"]


def test_texto_longo_quebra_na_margem_sem_perder_palavra():
    linhas = extract_lines(write_pdf([Line(ORIENTACAO_LONGA)]))

    assert len(linhas) > 1
    assert " ".join(linhas) == ORIENTACAO_LONGA


def test_documento_longo_ocupa_mais_de_uma_pagina():
    linhas = [Line(f"Alimento {n} - 10 g") for n in range(120)]

    extraidas = extract_lines(write_pdf(linhas))

    assert extraidas == [linha.text for linha in linhas]


def test_acento_sai_legivel():
    assert extract_lines(write_pdf([Line("Feijão, maçã e açúcar")])) == ["Feijão, maçã e açúcar"]


def test_orientacao_longa_continua_descartada_ate_a_proxima_refeicao():
    linhas = [
        "08:30 - Café da manhã",
        "Pão francês - 50 g",
        f"Orientação: {ORIENTACAO_LONGA}",
        "dia.",
        "12:30 - Almoço",
        "Arroz - 150 g",
    ]

    assert _discard_reasons(linhas) == [
        "cabeçalho de refeição",
        None,
        "texto de orientação",
        "texto de orientação",
        "cabeçalho de refeição",
        None,
    ]


# --------------------------------------------------------------------------
# ida e volta pelo import
# --------------------------------------------------------------------------

def test_o_pdf_importado_rende_so_os_itens_principais(client, camila, marina):
    importado = _importar(client, marina, _pdf(client, camila, plano_da_nutricionista()))

    assert _itens(importado) == [
        ("Pão francês", "50.000", "g"),
        ("Ovos de galinha", "2.000", "unidade"),
        ("Arroz branco cozido", "150.000", "g"),
        ("Feijão cozido", "50.000", "g"),
    ]
    motivos = {linha["text"]: linha["reason"] for linha in importado["discarded"]}
    assert motivos["Substituição 1"] == "opção de substituição"
    assert motivos["Tapioca - 35 g - 2 colheres de sopa"] == "opção de substituição"
    assert motivos["Orientação: Evite açúcar no café."] == "texto de orientação"
    assert motivos["Camila Fernandes"] == "cabeçalho do documento"


def test_pdf_e_email_rendem_os_mesmos_itens(client, camila, marina, outra_pessoa):
    corpo = plano_da_nutricionista()
    pelo_pdf = _importar(client, outra_pessoa, _pdf(client, camila, corpo))

    criado = client.post(ROTA, json=corpo, headers=auth_headers(camila)).json()
    client.post(
        f"{ROTA}/{criado['id']}/send",
        json={"patient_email": "marina@example.com"},
        headers=auth_headers(camila),
    )
    pelo_email = client.post(
        f"/prescriptions/received/{criado['id']}/accept",
        json={"consent_accepted": True},
        headers=auth_headers(marina),
    ).json()

    assert _itens(pelo_pdf) == _itens(pelo_email)


def test_orientacao_longa_e_curta_nao_viram_item(client, camila, marina):
    corpo = plano_da_nutricionista(notes=f"{ORIENTACAO_LONGA}\nTome sol.")
    corpo["meals"][1]["notes"] = f"{ORIENTACAO_LONGA}\nSem fritura."

    importado = _importar(client, marina, _pdf(client, camila, corpo))

    assert len(importado["meal_plan"]["items"]) == 4


def test_plano_grande_volta_inteiro(client, camila, marina):
    refeicao = plano_da_nutricionista()["meals"][1]
    corpo = plano_da_nutricionista(
        meals=[
            {**refeicao, "name": f"Refeição {n}", "time": f"{6 + n:02d}:00"}
            for n in range(12)
        ]
    )

    importado = _importar(client, marina, _pdf(client, camila, corpo))

    # Doze refeições de dois itens, em mais de uma página.
    assert len(importado["meal_plan"]["items"]) == 24


def test_pdf_de_outra_nutricionista_responde_404(client, camila, marina, db_session):
    criado = client.post(ROTA, json=plano_da_nutricionista(), headers=auth_headers(camila)).json()

    assert client.get(f"{ROTA}/{criado['id']}/pdf", headers=auth_headers(marina)).status_code == 404
