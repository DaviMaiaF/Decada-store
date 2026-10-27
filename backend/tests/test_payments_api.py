"""Testes das rotas de pagamento simulado.

As regras do gateway estão em `test_payment_gateway.py`; aqui fica o que é da
rota: o código HTTP de cada caso, o 404 para recurso alheio e o que a resposta
expõe — e o que ela não expõe — do cartão.
"""

from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import Payment
from tests.helpers import auth_headers, plano_confirmado

pytestmark = pytest.mark.db

CARTAO = {
    "number": "4235 6477 2802 5682",
    "holder_name": "APRO",
    "expiration_month": 11,
    "expiration_year": 2030,
    "security_code": "123",
}


@pytest.fixture
def lista_id(client, marina, db_session) -> str:
    plano_id, _ = plano_confirmado(client, marina, db_session)
    resposta = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=auth_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    )
    return resposta.json()["shopping_list"]["id"]


def _pagar(client, user, lista_id, **corpo):
    return client.post(
        f"/shopping-lists/{lista_id}/payments", headers=auth_headers(user), json=corpo
    )


def _total(client, user, lista_id) -> Decimal:
    lista = client.get(f"/shopping-lists/{lista_id}", headers=auth_headers(user)).json()
    return Decimal(lista["estimated_total"])


def test_pix_volta_pendente_com_copia_e_cola(client, marina, lista_id):
    resposta = _pagar(client, marina, lista_id, method="pix")

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["status"] == "pendente"
    assert corpo["pix_code"].startswith("000201")
    assert corpo["simulated"] is True
    assert Decimal(corpo["amount"]) == _total(client, marina, lista_id)


def test_confirmar_o_pix_aprova(client, marina, lista_id):
    pix = _pagar(client, marina, lista_id, method="pix").json()

    resposta = client.post(
        f"/shopping-lists/{lista_id}/payments/{pix['id']}/confirmation",
        headers=auth_headers(marina),
    )

    assert resposta.status_code == 200
    assert resposta.json()["status"] == "aprovado"
    assert resposta.json()["paid_at"] is not None


def test_consultar_o_pagamento_mostra_o_status_atual(client, marina, lista_id):
    pix = _pagar(client, marina, lista_id, method="pix").json()
    url = f"/shopping-lists/{lista_id}/payments/{pix['id']}"

    assert client.get(url, headers=auth_headers(marina)).json()["status"] == "pendente"
    client.post(f"{url}/confirmation", headers=auth_headers(marina))
    assert client.get(url, headers=auth_headers(marina)).json()["status"] == "aprovado"


def test_cartao_aprovado_devolve_so_bandeira_e_final(client, marina, lista_id):
    resposta = _pagar(client, marina, lista_id, method="cartao_credito", card=CARTAO)

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["status"] == "aprovado"
    assert corpo["card_brand"] == "visa"
    assert corpo["card_last_four"] == "5682"
    # Nada do que identificaria o cartão volta, nem por engano.
    texto = resposta.text
    assert "4235647728025682" not in texto
    assert "4235 6477" not in texto
    assert "security_code" not in corpo


def test_cartao_recusado_tambem_e_201(client, marina, lista_id):
    resposta = _pagar(
        client, marina, lista_id, method="cartao_credito", card={**CARTAO, "holder_name": "FUND"}
    )

    assert resposta.status_code == 201
    assert resposta.json()["status"] == "recusado"
    assert "saldo" in resposta.json()["status_detail"]


def test_cartao_invalido_e_422_e_nao_grava(client, marina, lista_id, db_session):
    resposta = _pagar(
        client,
        marina,
        lista_id,
        method="cartao_credito",
        card={**CARTAO, "number": "4235 6477 2802 5683"},
    )

    assert resposta.status_code == 422
    assert "número do cartão" in resposta.json()["detail"]
    assert db_session.scalars(select(Payment)).first() is None


def test_cartao_sem_dados_e_422(client, marina, lista_id):
    assert _pagar(client, marina, lista_id, method="cartao_credito").status_code == 422


def test_pix_nao_aceita_dados_de_cartao(client, marina, lista_id):
    assert _pagar(client, marina, lista_id, method="pix", card=CARTAO).status_code == 422


def test_lista_paga_responde_409(client, marina, lista_id):
    _pagar(client, marina, lista_id, method="cartao_credito", card=CARTAO)

    resposta = _pagar(client, marina, lista_id, method="pix")

    assert resposta.status_code == 409


def test_confirmar_pagamento_que_nao_esta_pendente_e_409(client, marina, lista_id):
    pago = _pagar(client, marina, lista_id, method="cartao_credito", card=CARTAO).json()

    resposta = client.post(
        f"/shopping-lists/{lista_id}/payments/{pago['id']}/confirmation",
        headers=auth_headers(marina),
    )

    assert resposta.status_code == 409


def test_historico_traz_todas_as_tentativas(client, marina, lista_id):
    recusado = _pagar(
        client, marina, lista_id, method="cartao_credito", card={**CARTAO, "holder_name": "OTHE"}
    ).json()
    aprovado = _pagar(client, marina, lista_id, method="cartao_credito", card=CARTAO).json()

    resposta = client.get(f"/shopping-lists/{lista_id}/payments", headers=auth_headers(marina))

    assert resposta.status_code == 200
    assert {p["id"] for p in resposta.json()} == {recusado["id"], aprovado["id"]}


def test_lista_sem_pagamento_devolve_historico_vazio(client, marina, lista_id):
    resposta = client.get(f"/shopping-lists/{lista_id}/payments", headers=auth_headers(marina))

    assert resposta.status_code == 200
    assert resposta.json() == []


def test_lista_de_outra_pessoa_e_404_em_todas_as_rotas(client, marina, outra_pessoa, lista_id):
    pix = _pagar(client, marina, lista_id, method="pix").json()
    base = f"/shopping-lists/{lista_id}/payments"
    alheio = auth_headers(outra_pessoa)

    assert client.post(base, headers=alheio, json={"method": "pix"}).status_code == 404
    assert client.get(base, headers=alheio).status_code == 404
    assert client.get(f"{base}/{pix['id']}", headers=alheio).status_code == 404
    assert client.post(f"{base}/{pix['id']}/confirmation", headers=alheio).status_code == 404


def test_pagamento_de_outra_lista_e_404(client, marina, outra_pessoa, db_session, lista_id):
    pix = _pagar(client, marina, lista_id, method="pix").json()
    plano_id, _ = plano_confirmado(client, outra_pessoa, db_session)
    outra_lista = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=auth_headers(outra_pessoa),
        json={"state_code": "DF", "city": "Brasília"},
    ).json()["shopping_list"]["id"]

    resposta = client.get(
        f"/shopping-lists/{outra_lista}/payments/{pix['id']}", headers=auth_headers(outra_pessoa)
    )

    assert resposta.status_code == 404


def test_pagar_exige_autenticacao(client, lista_id):
    assert (
        client.post(f"/shopping-lists/{lista_id}/payments", json={"method": "pix"}).status_code
        == 401
    )
