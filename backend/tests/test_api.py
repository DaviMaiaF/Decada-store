"""Testes das rotas da API.

Exercitam o caminho completo pelo HTTP: importar o plano, confirmar o
casamento, gerar a lista e pedir receitas. A regra de negócio já tem teste
próprio nos módulos de serviço — aqui o que se verifica é o contrato: código de
status, formato da resposta e, principalmente, que ninguém enxerga dado de
outra pessoa.
"""

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.database import get_db
from app.main import app
from app.models import PantryItem, Product, User
from tests.test_import_plan import PLANO_REALISTA
from tests.test_pdf import build_pdf

pytestmark = pytest.mark.db


@pytest.fixture
def client(db_session):
    """Cliente HTTP usando a sessão de teste, para tudo rodar na mesma transação."""
    from app.seeds.runner import run as carregar_seed

    carregar_seed(db_session)

    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as cliente:
        yield cliente
    app.dependency_overrides.clear()


@pytest.fixture
def marina(db_session) -> User:
    pessoa = User(email="marina@decada.local")
    db_session.add(pessoa)
    db_session.commit()
    return pessoa


@pytest.fixture
def outra_pessoa(db_session) -> User:
    pessoa = User(email="outra@decada.local")
    db_session.add(pessoa)
    db_session.commit()
    return pessoa


def _headers(user: User) -> dict[str, str]:
    return {"X-User-Id": str(user.id)}


def _importar(client, user, linhas=None) -> dict:
    resposta = client.post(
        "/meal-plans",
        headers=_headers(user),
        files={"file": ("plano.pdf", build_pdf(linhas or PLANO_REALISTA), "application/pdf")},
        data={"consent_accepted": "true"},
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


# --------------------------------------------------------------------------
# identidade provisória
# --------------------------------------------------------------------------

def test_health_continua_aberto(client):
    assert client.get("/health").status_code == 200


def test_rota_de_dominio_sem_o_cabecalho_recusa(client):
    assert client.get("/pantry").status_code == 401


def test_cabecalho_apontando_para_usuario_inexistente_recusa(client):
    resposta = client.get(
        "/pantry", headers={"X-User-Id": "00000000-0000-0000-0000-000000000000"}
    )
    assert resposta.status_code == 401


def test_cabecalho_malformado_recusa(client):
    assert client.get("/pantry", headers={"X-User-Id": "isto-nao-e-uuid"}).status_code == 422


# --------------------------------------------------------------------------
# import do plano
# --------------------------------------------------------------------------

def test_importa_o_plano_por_pdf(client, marina):
    corpo = _importar(client, marina)

    assert corpo["items_created"] == 5
    assert corpo["meal_plan"]["consent_version"] == "v1"
    assert len(corpo["meal_plan"]["items"]) == 5


def test_o_relatorio_do_descarte_volta_na_resposta(client, marina):
    corpo = _importar(client, marina)

    motivos = {linha["reason"] for linha in corpo["discarded"]}
    assert "cabeçalho de refeição" in motivos
    assert corpo["discarded"]


def test_sem_aceite_do_termo_nao_grava_plano(client, marina, db_session):
    from app.models import MealPlan

    resposta = client.post(
        "/meal-plans",
        headers=_headers(marina),
        files={"file": ("plano.pdf", build_pdf(PLANO_REALISTA), "application/pdf")},
        data={"consent_accepted": "false"},
    )

    assert resposta.status_code == 422
    assert db_session.scalars(select(MealPlan)).all() == []


def test_pdf_digitalizado_devolve_422_com_explicacao(client, marina):
    resposta = client.post(
        "/meal-plans",
        headers=_headers(marina),
        files={"file": ("foto.pdf", build_pdf([]), "application/pdf")},
        data={"consent_accepted": "true"},
    )

    assert resposta.status_code == 422
    assert "OCR" in resposta.json()["detail"]


def test_arquivo_que_nao_e_pdf_devolve_400(client, marina):
    resposta = client.post(
        "/meal-plans",
        headers=_headers(marina),
        files={"file": ("plano.pdf", b"nao sou um pdf", "application/pdf")},
        data={"consent_accepted": "true"},
    )

    assert resposta.status_code == 400


def test_plano_de_outra_pessoa_devolve_404(client, marina, outra_pessoa):
    plano_id = _importar(client, marina)["meal_plan"]["id"]

    resposta = client.get(f"/meal-plans/{plano_id}", headers=_headers(outra_pessoa))

    # 404 e não 403: dizer "existe mas não é seu" já vazaria dado de saúde.
    assert resposta.status_code == 404


# --------------------------------------------------------------------------
# casamento e confirmação
# --------------------------------------------------------------------------

def test_lista_candidatos_para_um_item(client, marina):
    plano = _importar(client, marina, ["1,2 kg de peito de frango sem pele"])
    item = plano["meal_plan"]["items"][0]

    resposta = client.get(
        f"/meal-plans/{plano['meal_plan']['id']}/items/{item['id']}/candidates",
        headers=_headers(marina),
    )

    assert resposta.status_code == 200
    candidatos = resposta.json()
    assert candidatos[0]["product"]["name"] == "Peito de frango sem pele"
    # Decimal viaja como string no JSON: é o que preserva a precisão de dinheiro.
    assert Decimal(candidatos[0]["score"]) > Decimal("0.6")


def test_confirmar_grava_o_produto_escolhido(client, marina, db_session):
    plano = _importar(client, marina, ["1,2 kg de peito de frango sem pele"])
    item = plano["meal_plan"]["items"][0]
    produto = db_session.scalars(
        select(Product).where(Product.name == "Peito de frango sem pele")
    ).one()

    resposta = client.post(
        f"/meal-plans/{plano['meal_plan']['id']}/items/{item['id']}/confirmation",
        headers=_headers(marina),
        json={"product_id": str(produto.id), "match_score": 0.93},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "confirmado"
    assert corpo["product_id"] == str(produto.id)


def test_nao_da_para_confirmar_item_de_plano_alheio(client, marina, outra_pessoa, db_session):
    plano = _importar(client, marina, ["1,2 kg de peito de frango sem pele"])
    item = plano["meal_plan"]["items"][0]
    produto = db_session.scalars(select(Product).limit(1)).one()

    resposta = client.post(
        f"/meal-plans/{plano['meal_plan']['id']}/items/{item['id']}/confirmation",
        headers=_headers(outra_pessoa),
        json={"product_id": str(produto.id)},
    )

    assert resposta.status_code == 404


# --------------------------------------------------------------------------
# lista de compras
# --------------------------------------------------------------------------

def _plano_confirmado(client, user, db_session, descricao="1,2 kg de peito de frango sem pele"):
    plano = _importar(client, user, [descricao])
    item = plano["meal_plan"]["items"][0]
    produto = db_session.scalars(
        select(Product).where(Product.name == "Peito de frango sem pele")
    ).one()
    client.post(
        f"/meal-plans/{plano['meal_plan']['id']}/items/{item['id']}/confirmation",
        headers=_headers(user),
        json={"product_id": str(produto.id)},
    )
    return plano["meal_plan"]["id"], produto


def test_gera_a_lista_de_compras(client, marina, db_session):
    plano_id, _ = _plano_confirmado(client, marina, db_session)

    resposta = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    )

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["items_to_buy"] == 1
    assert Decimal(corpo["shopping_list"]["estimated_total"]) > 0


def test_todo_preco_vem_com_data_origem_e_confianca(client, marina, db_session):
    plano_id, _ = _plano_confirmado(client, marina, db_session)
    lista = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    ).json()["shopping_list"]

    item = lista["items"][0]
    # Decisão 1 do projeto: preço não anda sozinho.
    assert item["price_reference_date"] is not None
    assert item["price_origin"] is not None
    assert item["price_confidence"] in {"atual", "recente", "estimativa"}
    assert item["price_sample_size"] > 0


def test_o_item_traz_a_categoria_para_a_tela_agrupar(client, marina, db_session):
    plano_id, _ = _plano_confirmado(client, marina, db_session)
    lista = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    ).json()["shopping_list"]

    assert lista["items"][0]["product"]["category"] == "proteinas"


def test_a_despensa_desconta_na_lista_gerada_pela_api(client, marina, db_session):
    plano_id, produto = _plano_confirmado(client, marina, db_session)

    client.post(
        "/pantry",
        headers=_headers(marina),
        json={
            "raw_description": "meio quilo de frango",
            "product_id": str(produto.id),
            "quantity": "0.5",
            "unit": "kg",
        },
    )

    lista = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    ).json()["shopping_list"]

    item = lista["items"][0]
    assert Decimal(item["quantity"]) == Decimal("0.700")
    assert Decimal(item["quantity_from_pantry"]) == Decimal("0.500")


def test_lista_de_outra_pessoa_devolve_404(client, marina, outra_pessoa, db_session):
    plano_id, _ = _plano_confirmado(client, marina, db_session)
    lista_id = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    ).json()["shopping_list"]["id"]

    assert client.get(f"/shopping-lists/{lista_id}", headers=_headers(marina)).status_code == 200
    assert (
        client.get(f"/shopping-lists/{lista_id}", headers=_headers(outra_pessoa)).status_code
        == 404
    )


# --------------------------------------------------------------------------
# despensa
# --------------------------------------------------------------------------

def test_guarda_e_lista_item_da_despensa(client, marina):
    resposta = client.post(
        "/pantry", headers=_headers(marina), json={"raw_description": "canela em pó"}
    )

    assert resposta.status_code == 201
    assert resposta.json()["quantity"] is None

    listagem = client.get("/pantry", headers=_headers(marina)).json()
    assert [item["raw_description"] for item in listagem] == ["canela em pó"]


def test_quantidade_sem_unidade_e_recusada(client, marina):
    resposta = client.post(
        "/pantry",
        headers=_headers(marina),
        json={"raw_description": "aveia", "quantity": "300"},
    )

    assert resposta.status_code == 422


def test_apaga_item_da_despensa(client, marina, db_session):
    item_id = client.post(
        "/pantry", headers=_headers(marina), json={"raw_description": "azeite"}
    ).json()["id"]

    assert client.delete(f"/pantry/{item_id}", headers=_headers(marina)).status_code == 204
    assert db_session.scalars(select(PantryItem)).all() == []


def test_nao_da_para_apagar_item_da_despensa_alheia(client, marina, outra_pessoa):
    item_id = client.post(
        "/pantry", headers=_headers(marina), json={"raw_description": "azeite"}
    ).json()["id"]

    assert client.delete(f"/pantry/{item_id}", headers=_headers(outra_pessoa)).status_code == 404


def test_a_despensa_de_cada_um_e_sua(client, marina, outra_pessoa):
    client.post("/pantry", headers=_headers(marina), json={"raw_description": "aveia"})

    assert client.get("/pantry", headers=_headers(outra_pessoa)).json() == []


def test_sugere_produto_para_o_item_digitado(client, marina):
    item_id = client.post(
        "/pantry", headers=_headers(marina), json={"raw_description": "aveia em flocos finos"}
    ).json()["id"]

    resposta = client.get(f"/pantry/{item_id}/candidates", headers=_headers(marina))

    assert resposta.status_code == 200
    assert resposta.json()[0]["product"]["name"] == "Aveia em flocos"


# --------------------------------------------------------------------------
# receitas
# --------------------------------------------------------------------------

def test_sugestoes_de_receita_vem_ordenadas(client, marina, db_session):
    aveia = db_session.scalars(select(Product).where(Product.name == "Aveia em flocos")).one()
    banana = db_session.scalars(select(Product).where(Product.name == "Banana prata")).one()
    ovos = db_session.scalars(select(Product).where(Product.name == "Ovos de galinha")).one()
    for produto, quantidade, unidade in (
        (aveia, "500", "g"),
        (banana, "1", "kg"),
        (ovos, "12", "unidade"),
    ):
        client.post(
            "/pantry",
            headers=_headers(marina),
            json={
                "raw_description": produto.name,
                "product_id": str(produto.id),
                "quantity": quantidade,
                "unit": unidade,
            },
        )

    corpo = client.get("/recipes/suggestions", headers=_headers(marina)).json()

    percentuais = [receita["percentage"] for receita in corpo]
    assert percentuais == sorted(percentuais, reverse=True)
    assert corpo[0]["recipe"]["slug"] == "panqueca-de-aveia-e-banana"
    assert corpo[0]["complete"] is True


def test_filtra_receitas_pelo_percentual_minimo(client, marina):
    corpo = client.get(
        "/recipes/suggestions?minimum_percentage=100", headers=_headers(marina)
    ).json()

    # Despensa vazia: nenhuma receita fica completa.
    assert corpo == []


def test_o_que_falta_na_receita_vem_nomeado(client, marina):
    corpo = client.get("/recipes/suggestions", headers=_headers(marina)).json()

    faltando = corpo[0]["missing"]
    assert faltando
    assert "name" in faltando[0]["product"]


def test_sugestao_com_lista_de_compras_de_outra_pessoa_devolve_404(
    client, marina, outra_pessoa, db_session
):
    plano_id, _ = _plano_confirmado(client, marina, db_session)
    lista_id = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    ).json()["shopping_list"]["id"]

    resposta = client.get(
        f"/recipes/suggestions?shopping_list_id={lista_id}", headers=_headers(outra_pessoa)
    )

    assert resposta.status_code == 404
