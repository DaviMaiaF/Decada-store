"""Testes do plano alimentar que a nutricionista monta no app.

O exemplo segue a forma de um plano do Dietbox — refeições com horário, itens em
medida caseira e gramas, substituições e orientação —, com dados inventados.
"""

import uuid
from datetime import time
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import Prescription, PrescriptionStatus, User, UserRole
from app.models.enums import MeasurementUnit
from app.models.prescription import PrescriptionItem, PrescriptionMeal
from app.services.prescriptions import item_line, prescription_lines
from tests.conftest import novo_usuario
from tests.helpers import auth_headers
from tests.helpers import plano_da_nutricionista as plano

ROTA = "/nutritionist/prescriptions"

@pytest.fixture
def beatriz(db_session) -> User:
    pessoa = novo_usuario(
        "beatriz@example.com",
        full_name="Beatriz Lima",
        role=UserRole.NUTRICIONISTA,
        crn="CRN-1 12345",
    )
    db_session.add(pessoa)
    db_session.commit()
    return pessoa


def _criar(client, autora: User, corpo: dict | None = None) -> dict:
    resposta = client.post(ROTA, json=corpo or plano(), headers=auth_headers(autora))
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


# --------------------------------------------------------------------------
# texto do documento — sem banco
# --------------------------------------------------------------------------

def _refeicao(nome: str, hora: time, itens: list[PrescriptionItem], notes=None):
    return PrescriptionMeal(name=nome, time=hora, notes=notes, items=itens)


def _item(food, quantity, unit, option=0, position=1, measure=None):
    return PrescriptionItem(
        food=food,
        quantity=Decimal(quantity),
        unit=unit,
        option=option,
        position=position,
        household_measure=measure,
    )


def test_linha_de_item_poe_a_compra_antes_da_medida_caseira():
    item = _item("Arroz branco cozido", "150.000", MeasurementUnit.GRAMA, measure="6 colheres")

    # O import fica com a primeira medida de massa ou volume: a de compra.
    assert item_line(item) == "Arroz branco cozido - 150 g - 6 colheres"


@pytest.mark.parametrize(
    ("quantidade", "unidade", "esperado"),
    [
        ("1.500", MeasurementUnit.QUILOGRAMA, "Leite - 1,5 kg"),
        ("1", MeasurementUnit.UNIDADE, "Leite - 1 unidade"),
        ("2", MeasurementUnit.UNIDADE, "Leite - 2 unidades"),
        ("200", MeasurementUnit.MILILITRO, "Leite - 200 ml"),
    ],
)
def test_linha_de_item_escreve_a_quantidade_em_portugues(quantidade, unidade, esperado):
    assert item_line(_item("Leite", quantidade, unidade)) == esperado


def test_documento_segue_o_formato_do_dietbox():
    autora = User(full_name="Camila Fernandes", crn="CRN-3 48291")
    documento = Prescription(
        title="Plano de outubro",
        patient_name="Paciente Fictícia",
        notes="Beba água.",
        meals=[
            _refeicao(
                "Café da manhã",
                time(8, 30),
                [
                    _item("Pão francês", "50", MeasurementUnit.GRAMA),
                    _item("Tapioca", "35", MeasurementUnit.GRAMA, option=1),
                ],
                notes="Evite açúcar.",
            ),
        ],
    )

    assert prescription_lines(documento, autora) == [
        "Camila Fernandes",
        "CRN-3 48291",
        "Plano Alimentar",
        "Plano de outubro",
        "Paciente Fictícia",
        "08:30 - Café da manhã",
        "Pão francês - 50 g",
        "Orientação: Evite açúcar.",
        "Substituição 1",
        "Tapioca - 35 g",
        "Orientações gerais:",
        "Orientação: Beba água.",
    ]


# --------------------------------------------------------------------------
# criar
# --------------------------------------------------------------------------



@pytest.mark.db
def test_cria_o_plano_como_rascunho(client, camila):
    criado = _criar(client, camila)

    assert criado["status"] == "rascunho"
    assert criado["patient_email"] is None
    assert [m["name"] for m in criado["meals"]] == ["Café da manhã", "Almoço"]
    cafe = criado["meals"][0]
    assert cafe["time"] == "08:30:00"
    assert [i["food"] for i in cafe["items"]] == ["Pão francês", "Ovos de galinha"]
    assert [[i["food"] for i in opcao] for opcao in cafe["substitutions"]] == [
        ["Tapioca", "Banana prata"]
    ]
    assert criado["meals"][1]["substitutions"] == []


@pytest.mark.db
@pytest.mark.parametrize(
    ("caminho", "valor"),
    [
        (("meals",), []),
        (("meals", 0, "items"), []),
        (("meals", 0, "time"), None),
        (("meals", 0, "name"), "08h Café"),
        (("meals", 0, "name"), "x" * 41),
        (("meals", 0, "items", 0, "food"), "Pão - francês"),
        (("meals", 0, "items", 0, "food"), "2 pães"),
        (("meals", 0, "items", 0, "food"), "x" * 46),
        (("meals", 0, "items", 0, "household_measure"), "x" * 26),
        (("meals", 0, "items", 0, "quantity"), "0"),
        (("meals", 0, "items", 0, "unit"), "xícara"),
        (("meals", 0, "substitutions"), [[]]),
    ],
)
def test_recusa_o_que_nao_voltaria_inteiro_pelo_pdf(client, camila, caminho, valor):
    corpo = plano()
    alvo = corpo
    for chave in caminho[:-1]:
        alvo = alvo[chave]
    alvo[caminho[-1]] = valor

    resposta = client.post(ROTA, json=corpo, headers=auth_headers(camila))

    assert resposta.status_code == 422, resposta.text


@pytest.mark.db
def test_campos_opcionais_vazios_viram_nulos(client, camila):
    criado = _criar(client, camila, plano(title="  ", notes=""))

    assert criado["title"] is None
    assert criado["notes"] is None


# --------------------------------------------------------------------------
# ler, editar e excluir só os próprios
# --------------------------------------------------------------------------

@pytest.mark.db
def test_lista_so_os_planos_da_propria_nutricionista(client, camila, beatriz):
    _criar(client, camila)
    _criar(client, beatriz, plano(title="Da Beatriz"))

    lista = client.get(ROTA, headers=auth_headers(camila)).json()

    assert [p["title"] for p in lista] == ["Plano de outubro"]
    assert lista[0]["meal_count"] == 2
    # A listagem não traz as refeições.
    assert "meals" not in lista[0]


@pytest.mark.db
def test_edita_o_plano_inteiro(client, camila):
    criado = _criar(client, camila)
    novo = plano(title="Plano revisto")
    novo["meals"] = novo["meals"][1:]

    resposta = client.put(f"{ROTA}/{criado['id']}", json=novo, headers=auth_headers(camila))

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["title"] == "Plano revisto"
    assert [m["name"] for m in resposta.json()["meals"]] == ["Almoço"]


@pytest.mark.db
def test_edicao_invalida_nao_mexe_no_plano(client, camila):
    criado = _criar(client, camila)

    client.put(f"{ROTA}/{criado['id']}", json=plano(meals=[]), headers=auth_headers(camila))

    guardado = client.get(f"{ROTA}/{criado['id']}", headers=auth_headers(camila)).json()
    assert len(guardado["meals"]) == 2


@pytest.mark.db
def test_plano_aceito_nao_pode_mais_ser_editado(client, camila, db_session):
    criado = _criar(client, camila)
    db_session.get(Prescription, uuid.UUID(criado["id"])).status = PrescriptionStatus.ACEITA
    db_session.commit()

    resposta = client.put(f"{ROTA}/{criado['id']}", json=plano(), headers=auth_headers(camila))

    assert resposta.status_code == 409


@pytest.mark.db
def test_exclui_o_plano(client, camila, db_session):
    criado = _criar(client, camila)

    resposta = client.delete(f"{ROTA}/{criado['id']}", headers=auth_headers(camila))

    assert resposta.status_code == 204
    assert db_session.get(Prescription, uuid.UUID(criado["id"])) is None
    assert db_session.scalars(select(PrescriptionMeal)).first() is None


@pytest.mark.db
@pytest.mark.parametrize("metodo", ["get", "put", "delete"])
def test_plano_de_outra_nutricionista_responde_404(client, camila, beatriz, metodo):
    da_beatriz = _criar(client, beatriz)
    extra = {"json": plano()} if metodo == "put" else {}

    resposta = getattr(client, metodo)(
        f"{ROTA}/{da_beatriz['id']}", headers=auth_headers(camila), **extra
    )

    assert resposta.status_code == 404


@pytest.mark.db
def test_paciente_nao_chega_nas_rotas_da_nutricionista(client, marina):
    assert client.get(ROTA, headers=auth_headers(marina)).status_code == 404
    assert client.post(ROTA, json=plano(), headers=auth_headers(marina)).status_code == 404


@pytest.mark.db
def test_excluir_a_conta_leva_os_planos_dela(client, camila, db_session):
    _criar(client, camila)
    _criar(client, camila)

    comprovante = client.delete("/auth/me", headers=auth_headers(camila)).json()

    assert comprovante["prescriptions_deleted"] == 2
    assert db_session.scalars(select(Prescription)).first() is None
