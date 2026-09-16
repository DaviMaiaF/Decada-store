"""Testes das rotas da API.

Exercitam o caminho completo pelo HTTP: importar o plano, confirmar o
casamento, gerar a lista e pedir receitas. A regra de negócio já tem teste
próprio nos módulos de serviço — aqui o que se verifica é o contrato: código de
status, formato da resposta e, principalmente, que ninguém enxerga dado de
outra pessoa.
"""

from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import PantryItem, Product
from app.services.security import create_access_token
from tests.helpers import PLANO_REALISTA, build_pdf, importar_plano, plano_confirmado
from tests.helpers import auth_headers as _headers

pytestmark = pytest.mark.db


# --------------------------------------------------------------------------
# autenticação
# --------------------------------------------------------------------------

def test_health_continua_aberto(client):
    assert client.get("/health").status_code == 200


def test_rota_de_dominio_sem_token_recusa(client):
    assert client.get("/pantry").status_code == 401


def test_token_de_usuario_inexistente_recusa(client):
    import uuid

    token = create_access_token(uuid.uuid4())
    resposta = client.get("/pantry", headers={"Authorization": f"Bearer {token}"})

    assert resposta.status_code == 401


def test_token_adulterado_recusa(client, marina):
    token = create_access_token(marina.id)
    resposta = client.get("/pantry", headers={"Authorization": f"Bearer {token}x"})

    assert resposta.status_code == 401


def test_token_malformado_recusa(client):
    assert client.get("/pantry", headers={"Authorization": "Bearer nada"}).status_code == 401


# --------------------------------------------------------------------------
# import do plano
# --------------------------------------------------------------------------

def test_importa_o_plano_por_pdf(client, marina):
    corpo = importar_plano(client, marina)

    assert corpo["items_created"] == 5
    assert corpo["meal_plan"]["consent_version"] == "v1"
    assert len(corpo["meal_plan"]["items"]) == 5


def test_o_relatorio_do_descarte_volta_na_resposta(client, marina):
    corpo = importar_plano(client, marina)

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
    plano_id = importar_plano(client, marina)["meal_plan"]["id"]

    resposta = client.get(f"/meal-plans/{plano_id}", headers=_headers(outra_pessoa))

    # 404 e não 403: dizer "existe mas não é seu" já vazaria dado de saúde.
    assert resposta.status_code == 404


# --------------------------------------------------------------------------
# casamento e confirmação
# --------------------------------------------------------------------------

def test_lista_candidatos_para_um_item(client, marina):
    plano = importar_plano(client, marina, ["1,2 kg de peito de frango sem pele"])
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
    plano = importar_plano(client, marina, ["1,2 kg de peito de frango sem pele"])
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
    plano = importar_plano(client, marina, ["1,2 kg de peito de frango sem pele"])
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

def test_gera_a_lista_de_compras(client, marina, db_session):
    plano_id, _ = plano_confirmado(client, marina, db_session)

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
    plano_id, _ = plano_confirmado(client, marina, db_session)
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
    plano_id, _ = plano_confirmado(client, marina, db_session)
    lista = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    ).json()["shopping_list"]

    assert lista["items"][0]["product"]["category"] == "proteinas"


def test_a_despensa_desconta_na_lista_gerada_pela_api(client, marina, db_session):
    plano_id, produto = plano_confirmado(client, marina, db_session)

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
    plano_id, _ = plano_confirmado(client, marina, db_session)
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


def test_a_economia_da_despensa_volta_na_lista(client, marina, db_session):
    plano_id, produto = plano_confirmado(client, marina, db_session)
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

    corpo = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    ).json()

    # Frango é a granel: o que estava em casa sai da conta na proporção.
    item = corpo["shopping_list"]["items"][0]
    assert Decimal(item["pantry_savings"]) > 0
    assert Decimal(corpo["pantry_savings"]) == Decimal(item["pantry_savings"])


def test_sem_despensa_a_economia_e_zero_e_nao_nula(client, marina, db_session):
    plano_id, _ = plano_confirmado(client, marina, db_session)

    corpo = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    ).json()

    # Zero é um fato ("não poupou nada"); nulo seria "não sei".
    assert Decimal(corpo["pantry_savings"]) == Decimal("0.00")


# --------------------------------------------------------------------------
# item comprado dentro do mercado
# --------------------------------------------------------------------------

def _lista_gerada(client, user, db_session) -> tuple[str, str]:
    """Gera uma lista de um item só e devolve (id da lista, id do item)."""
    plano_id, _ = plano_confirmado(client, user, db_session)
    lista = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=_headers(user),
        json={"state_code": "DF", "city": "Brasília"},
    ).json()["shopping_list"]
    return lista["id"], lista["items"][0]["id"]


def test_lista_recem_gerada_nasce_toda_desmarcada(client, marina, db_session):
    _, item_id = _lista_gerada(client, marina, db_session)
    lista_id, _ = _lista_gerada(client, marina, db_session)

    itens = client.get(f"/shopping-lists/{lista_id}", headers=_headers(marina)).json()["items"]

    assert [item["purchased"] for item in itens] == [False]
    assert itens[0]["purchased_at"] is None
    assert item_id  # a primeira lista continua existindo: o histórico é proposital


def test_marca_e_desmarca_o_item_comprado(client, marina, db_session):
    lista_id, item_id = _lista_gerada(client, marina, db_session)

    marcado = client.patch(
        f"/shopping-lists/{lista_id}/items/{item_id}",
        headers=_headers(marina),
        json={"purchased": True},
    )

    assert marcado.status_code == 200
    assert marcado.json()["purchased"] is True
    assert marcado.json()["purchased_at"] is not None

    desmarcado = client.patch(
        f"/shopping-lists/{lista_id}/items/{item_id}",
        headers=_headers(marina),
        json={"purchased": False},
    )

    assert desmarcado.json()["purchased"] is False
    assert desmarcado.json()["purchased_at"] is None


def test_o_estado_do_item_comprado_sobrevive_a_releitura(client, marina, db_session):
    lista_id, item_id = _lista_gerada(client, marina, db_session)

    client.patch(
        f"/shopping-lists/{lista_id}/items/{item_id}",
        headers=_headers(marina),
        json={"purchased": True},
    )

    # O ponto do recurso: sair da tela e voltar não perde o que foi marcado.
    relido = client.get(f"/shopping-lists/{lista_id}", headers=_headers(marina)).json()
    assert relido["items"][0]["purchased"] is True


def test_marcar_duas_vezes_nao_move_a_data(client, marina, db_session):
    lista_id, item_id = _lista_gerada(client, marina, db_session)
    caminho = f"/shopping-lists/{lista_id}/items/{item_id}"

    primeira = client.patch(caminho, headers=_headers(marina), json={"purchased": True}).json()
    segunda = client.patch(caminho, headers=_headers(marina), json={"purchased": True}).json()

    # Dentro do mercado o toque repetido acontece; ele não pode reescrever o
    # horário em que a pessoa realmente pegou o item.
    assert segunda["purchased_at"] == primeira["purchased_at"]


def test_item_dispensado_pela_despensa_aceita_marcacao(client, marina, db_session):
    plano_id, produto = plano_confirmado(client, marina, db_session)
    client.post(
        "/pantry",
        headers=_headers(marina),
        json={
            "raw_description": "frango de sobra",
            "product_id": str(produto.id),
            "quantity": "2",
            "unit": "kg",
        },
    )
    lista = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    ).json()["shopping_list"]
    item = lista["items"][0]
    assert item["dispensed_by_pantry"] is True

    # O servidor guarda o fato; oferecer ou não o botão é decisão da tela.
    resposta = client.patch(
        f"/shopping-lists/{lista['id']}/items/{item['id']}",
        headers=_headers(marina),
        json={"purchased": True},
    )

    assert resposta.status_code == 200
    assert resposta.json()["purchased"] is True


def test_item_de_lista_de_outra_pessoa_nao_pode_ser_marcado(
    client, marina, outra_pessoa, db_session
):
    lista_id, item_id = _lista_gerada(client, marina, db_session)

    resposta = client.patch(
        f"/shopping-lists/{lista_id}/items/{item_id}",
        headers=_headers(outra_pessoa),
        json={"purchased": True},
    )

    # 404 e não 403: responder 403 confirmaria que a lista existe.
    assert resposta.status_code == 404


def test_item_que_nao_e_desta_lista_devolve_404(client, marina, db_session):
    lista_id, _ = _lista_gerada(client, marina, db_session)
    outra_lista_id, item_de_outra = _lista_gerada(client, marina, db_session)

    resposta = client.patch(
        f"/shopping-lists/{lista_id}/items/{item_de_outra}",
        headers=_headers(marina),
        json={"purchased": True},
    )

    assert resposta.status_code == 404
    assert outra_lista_id != lista_id


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
    plano_id, _ = plano_confirmado(client, marina, db_session)
    lista_id = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    ).json()["shopping_list"]["id"]

    resposta = client.get(
        f"/recipes/suggestions?shopping_list_id={lista_id}", headers=_headers(outra_pessoa)
    )

    assert resposta.status_code == 404


# --------------------------------------------------------------------------
# busca no catálogo
# --------------------------------------------------------------------------

def test_busca_produto_por_texto_livre(client, marina):
    resposta = client.get("/products/search?q=aveia em flocos", headers=_headers(marina))

    assert resposta.status_code == 200
    assert resposta.json()[0]["product"]["name"] == "Aveia em flocos"


def test_a_busca_respeita_o_limite(client, marina):
    corpo = client.get("/products/search?q=arroz&limit=3", headers=_headers(marina)).json()

    assert len(corpo) == 3


def test_busca_curta_demais_e_recusada(client, marina):
    # Uma letra devolveria o catálogo inteiro ordenado por ruído.
    assert client.get("/products/search?q=a", headers=_headers(marina)).status_code == 422


def test_busca_exige_autenticacao(client):
    assert client.get("/products/search?q=aveia").status_code == 401
