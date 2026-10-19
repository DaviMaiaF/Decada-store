"""Testes das receitas escritas pela nutricionista.

Três coisas precisam ficar provadas: a receita só aceita ingrediente que dá para
medir (produto do catálogo, unidade da grandeza certa), cada nutricionista só
mexe nas próprias, e o que ela publica chega às sugestões do paciente com a
assinatura dela.
"""

import uuid

import pytest
from sqlalchemy import select

from app.models import Product, Recipe, RecipeIngredient, User, UserRole
from tests.conftest import novo_usuario
from tests.helpers import auth_headers

pytestmark = pytest.mark.db

ROTA = "/nutritionist/recipes"


def _produto(db_session, nome: str) -> Product:
    return db_session.scalars(select(Product).where(Product.name == nome)).first()


@pytest.fixture
def receita(db_session) -> dict:
    """Corpo de uma receita válida, feita com produtos do catálogo do seed."""
    return {
        "name": "Omelete de espinafre",
        "instructions": "Bata os ovos, junte o espinafre e doure na frigideira.",
        "servings": 1,
        "prep_minutes": 10,
        "ingredients": [
            {
                "product_id": str(_produto(db_session, "Ovos de galinha").id),
                "quantity": "2",
                "unit": "unidade",
            },
            {
                "product_id": str(_produto(db_session, "Aveia em flocos").id),
                "quantity": "20",
                "unit": "g",
                "optional": True,
            },
        ],
    }


@pytest.fixture
def beatriz(db_session) -> User:
    """Outra nutricionista, para provar que uma não mexe na receita da outra."""
    pessoa = novo_usuario(
        "beatriz@example.com",
        full_name="Beatriz Lima",
        role=UserRole.NUTRICIONISTA,
        crn="CRN-1 12345",
    )
    db_session.add(pessoa)
    db_session.commit()
    return pessoa


def _criar(client, autora: User, corpo: dict) -> dict:
    resposta = client.post(ROTA, json=corpo, headers=auth_headers(autora))
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


# --------------------------------------------------------------------------
# criar
# --------------------------------------------------------------------------

def test_cria_receita_assinada_pela_nutricionista(client, camila, receita):
    criada = _criar(client, camila, receita)

    assert criada["name"] == "Omelete de espinafre"
    assert criada["author"] == {"full_name": "Camila Fernandes", "crn": "CRN-3 48291"}
    assert criada["is_fictitious"] is False
    assert len(criada["ingredients"]) == 2


def test_a_autora_nao_expoe_o_email(client, camila, receita):
    criada = _criar(client, camila, receita)

    assert "email" not in criada["author"]


def test_duas_receitas_com_o_mesmo_nome_convivem(client, camila, beatriz, receita):
    primeira = _criar(client, camila, receita)
    segunda = _criar(client, beatriz, receita)

    assert primeira["slug"] != segunda["slug"]


def test_produto_fora_do_catalogo_e_recusado(client, camila, receita):
    receita["ingredients"][0]["product_id"] = str(uuid.uuid4())

    resposta = client.post(ROTA, json=receita, headers=auth_headers(camila))

    assert resposta.status_code == 422


def test_unidade_de_outra_grandeza_e_recusada(client, camila, receita):
    # Aveia é vendida por quilo; mililitro não se converte em grama.
    receita["ingredients"][1]["unit"] = "ml"

    resposta = client.post(ROTA, json=receita, headers=auth_headers(camila))

    assert resposta.status_code == 422
    assert "Aveia em flocos" in resposta.json()["detail"]


def test_produto_repetido_e_recusado(client, camila, receita):
    receita["ingredients"].append(dict(receita["ingredients"][0]))

    resposta = client.post(ROTA, json=receita, headers=auth_headers(camila))

    assert resposta.status_code == 422


def test_receita_so_de_opcionais_e_recusada(client, camila, receita):
    for ingrediente in receita["ingredients"]:
        ingrediente["optional"] = True

    resposta = client.post(ROTA, json=receita, headers=auth_headers(camila))

    assert resposta.status_code == 422


def test_receita_sem_ingrediente_e_recusada(client, camila, receita):
    receita["ingredients"] = []

    assert client.post(ROTA, json=receita, headers=auth_headers(camila)).status_code == 422


@pytest.mark.parametrize("quantidade", ["0", "-1"])
def test_quantidade_precisa_ser_positiva(client, camila, receita, quantidade):
    receita["ingredients"][0]["quantity"] = quantidade

    assert client.post(ROTA, json=receita, headers=auth_headers(camila)).status_code == 422


def test_nome_so_com_espaco_e_recusado(client, camila, receita):
    receita["name"] = "   "

    assert client.post(ROTA, json=receita, headers=auth_headers(camila)).status_code == 422


def test_receita_recusada_nao_deixa_rastro(client, camila, receita, db_session):
    receita["ingredients"][1]["unit"] = "ml"

    client.post(ROTA, json=receita, headers=auth_headers(camila))

    assert db_session.scalars(select(Recipe).where(Recipe.author_id == camila.id)).first() is None


# --------------------------------------------------------------------------
# ler, editar e excluir só as próprias
# --------------------------------------------------------------------------

def test_lista_so_as_receitas_da_propria_nutricionista(client, camila, beatriz, receita):
    _criar(client, camila, receita)
    _criar(client, beatriz, {**receita, "name": "Mingau de aveia"})

    nomes = [r["name"] for r in client.get(ROTA, headers=auth_headers(camila)).json()]

    # Nem a da Beatriz nem as do seed aparecem aqui.
    assert nomes == ["Omelete de espinafre"]


def test_le_uma_receita_propria(client, camila, receita):
    criada = _criar(client, camila, receita)

    resposta = client.get(f"{ROTA}/{criada['id']}", headers=auth_headers(camila))

    assert resposta.status_code == 200
    assert resposta.json()["id"] == criada["id"]


def test_edita_a_receita_inteira(client, camila, receita, db_session):
    criada = _criar(client, camila, receita)
    banana = _produto(db_session, "Banana prata")
    editada = {
        **receita,
        "name": "Omelete com banana",
        "servings": 2,
        # Fica um dos antigos e entra um novo; a aveia sai.
        "ingredients": [
            receita["ingredients"][0],
            {"product_id": str(banana.id), "quantity": "100", "unit": "g"},
        ],
    }

    resposta = client.put(f"{ROTA}/{criada['id']}", json=editada, headers=auth_headers(camila))

    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["name"] == "Omelete com banana"
    assert corpo["servings"] == 2
    assert corpo["slug"] == criada["slug"]
    assert {i["product"]["name"] for i in corpo["ingredients"]} == {
        "Ovos de galinha",
        "Banana prata",
    }


def test_edicao_invalida_nao_altera_a_receita(client, camila, receita):
    criada = _criar(client, camila, receita)
    invalida = {**receita, "name": "Outro nome"}
    invalida["ingredients"] = [dict(i) for i in receita["ingredients"]]
    invalida["ingredients"][0]["product_id"] = str(uuid.uuid4())

    resposta = client.put(f"{ROTA}/{criada['id']}", json=invalida, headers=auth_headers(camila))

    assert resposta.status_code == 422
    guardada = client.get(f"{ROTA}/{criada['id']}", headers=auth_headers(camila)).json()
    assert guardada["name"] == "Omelete de espinafre"
    assert len(guardada["ingredients"]) == 2


def test_exclui_a_receita_e_os_ingredientes(client, camila, receita, db_session):
    criada = _criar(client, camila, receita)
    receita_id = uuid.UUID(criada["id"])

    resposta = client.delete(f"{ROTA}/{criada['id']}", headers=auth_headers(camila))

    assert resposta.status_code == 204
    assert db_session.get(Recipe, receita_id) is None
    assert (
        db_session.scalars(
            select(RecipeIngredient).where(RecipeIngredient.recipe_id == receita_id)
        ).first()
        is None
    )


@pytest.mark.parametrize("metodo", ["get", "put", "delete"])
def test_receita_de_outra_nutricionista_responde_404(
    client, camila, beatriz, receita, metodo
):
    da_beatriz = _criar(client, beatriz, receita)
    extra = {"json": receita} if metodo == "put" else {}

    resposta = getattr(client, metodo)(
        f"{ROTA}/{da_beatriz['id']}", headers=auth_headers(camila), **extra
    )

    # 404, nunca 403 (decisão 10).
    assert resposta.status_code == 404


@pytest.mark.parametrize("metodo", ["get", "put", "delete"])
def test_receita_do_seed_nao_e_de_ninguem(client, camila, receita, db_session, metodo):
    do_seed = db_session.scalars(select(Recipe).where(Recipe.author_id.is_(None))).first()
    extra = {"json": receita} if metodo == "put" else {}

    resposta = getattr(client, metodo)(
        f"{ROTA}/{do_seed.id}", headers=auth_headers(camila), **extra
    )

    assert resposta.status_code == 404


def test_paciente_nao_chega_nas_rotas_da_nutricionista(client, marina, receita):
    assert client.get(ROTA, headers=auth_headers(marina)).status_code == 404
    assert client.post(ROTA, json=receita, headers=auth_headers(marina)).status_code == 404


def test_sem_token_nao_entra(client, receita):
    assert client.post(ROTA, json=receita).status_code == 401


# --------------------------------------------------------------------------
# o que o paciente vê
# --------------------------------------------------------------------------

def test_a_receita_publicada_chega_as_sugestoes_do_paciente(client, camila, marina, receita):
    _criar(client, camila, receita)

    sugestoes = client.get("/recipes/suggestions", headers=auth_headers(marina)).json()

    da_camila = [s for s in sugestoes if s["recipe"]["name"] == "Omelete de espinafre"]
    assert len(da_camila) == 1
    assert da_camila[0]["recipe"]["author"]["crn"] == "CRN-3 48291"


def test_receita_do_seed_aparece_sem_autora(client, marina):
    sugestoes = client.get("/recipes/suggestions", headers=auth_headers(marina)).json()

    assert sugestoes
    assert all(s["recipe"]["author"] is None for s in sugestoes)


# --------------------------------------------------------------------------
# exclusão da conta (LGPD)
# --------------------------------------------------------------------------

def test_excluir_a_conta_leva_as_receitas_junto(client, camila, receita, db_session):
    _criar(client, camila, receita)
    _criar(client, camila, {**receita, "name": "Mingau de aveia"})

    comprovante = client.delete("/auth/me", headers=auth_headers(camila)).json()

    assert comprovante["recipes_deleted"] == 2
    restante = select(Recipe).where(Recipe.name == "Mingau de aveia")
    assert db_session.scalars(restante).first() is None


def test_excluir_a_conta_nao_leva_receita_de_outra(client, camila, beatriz, receita, db_session):
    da_beatriz = _criar(client, beatriz, receita)

    client.delete("/auth/me", headers=auth_headers(camila))

    assert db_session.get(Recipe, uuid.UUID(da_beatriz["id"])) is not None


def test_paciente_excluindo_a_conta_nao_apaga_receita(client, marina, camila, receita):
    _criar(client, camila, receita)

    comprovante = client.delete("/auth/me", headers=auth_headers(marina)).json()

    assert comprovante["recipes_deleted"] == 0
