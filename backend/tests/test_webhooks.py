"""Testes do webhook do Abacate Pay.

O corpo segue o exemplo de `transparent.completed` da documentação, com os dados
de quem pagou, para o teste provar que eles não ficam guardados.
"""

import base64
import hashlib
import hmac
import json
import logging

import pytest
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.core.logs import RedactWebhookSecret
from app.models import Payment
from app.services.abacatepay import WEBHOOK_PUBLIC_KEY
from tests.helpers import PixFalso, auth_headers, plano_confirmado

pytestmark = pytest.mark.db

SEGREDO = "segredo-do-webhook"
URL = "/webhooks/abacatepay"
CARTAO = {
    "number": "4235 6477 2802 5682",
    "holder_name": "APRO",
    "expiration_month": 11,
    "expiration_year": 2030,
    "security_code": "123",
}


@pytest.fixture(autouse=True)
def configuracao(client) -> None:
    from app.main import app

    app.dependency_overrides[get_settings] = lambda: Settings(abacatepay_webhook_secret=SEGREDO)


@pytest.fixture
def lista_id(client, marina, db_session) -> str:
    from app.api.routes.payments import get_pix_provider
    from app.main import app

    app.dependency_overrides[get_pix_provider] = PixFalso
    plano_id, _ = plano_confirmado(client, marina, db_session)
    resposta = client.post(
        f"/meal-plans/{plano_id}/shopping-lists",
        headers=auth_headers(marina),
        json={"state_code": "DF", "city": "Brasília"},
    )
    return resposta.json()["shopping_list"]["id"]


@pytest.fixture
def pix(client, marina, lista_id, db_session) -> Payment:
    resposta = client.post(
        f"/shopping-lists/{lista_id}/payments",
        headers=auth_headers(marina),
        json={"method": "pix"},
    )
    return db_session.get(Payment, resposta.json()["id"])


def _evento(external_id: str, event="transparent.completed", status="PAID", dev_mode=True) -> bytes:
    return json.dumps(
        {
            "id": "log_teste",
            "event": event,
            "apiVersion": 2,
            "devMode": dev_mode,
            "data": {
                "transparent": {
                    "id": external_id,
                    "amount": 8740,
                    "status": status,
                    "devMode": dev_mode,
                },
                "customer": {"name": "Maria Santos", "taxId": "529.***.247-**"},
                "payerInformation": {"method": "PIX", "PIX": {"name": "Maria Santos"}},
            },
        }
    ).encode()


def _assinar(corpo: bytes) -> str:
    digest = hmac.new(WEBHOOK_PUBLIC_KEY.encode(), corpo, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def _avisar(client, corpo: bytes, segredo=SEGREDO, assinatura=None):
    return client.post(
        URL,
        params={"webhookSecret": segredo} if segredo else None,
        content=corpo,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": assinatura if assinatura is not None else _assinar(corpo),
        },
    )


def test_aviso_de_pix_pago_aprova_o_pagamento(client, pix, db_session):
    resposta = _avisar(client, _evento(pix.external_id))

    assert resposta.status_code == 200
    db_session.refresh(pix)
    assert pix.status.value == "aprovado"
    assert pix.paid_at is not None


def test_aviso_repetido_nao_muda_nada(client, pix, db_session):
    corpo = _evento(pix.external_id)
    _avisar(client, corpo)
    db_session.refresh(pix)
    pago_em = pix.paid_at

    resposta = _avisar(client, corpo)

    assert resposta.status_code == 200
    db_session.refresh(pix)
    assert pix.paid_at == pago_em


@pytest.mark.parametrize("segredo", [None, "segredo-errado"])
def test_segredo_errado_e_401_e_nao_aprova(client, pix, db_session, segredo):
    assert _avisar(client, _evento(pix.external_id), segredo=segredo).status_code == 401
    db_session.refresh(pix)
    assert pix.status.value == "pendente"


def test_sem_segredo_configurado_todo_aviso_e_recusado(client, pix, db_session):
    from app.main import app

    app.dependency_overrides[get_settings] = lambda: Settings(abacatepay_webhook_secret=None)

    assert _avisar(client, _evento(pix.external_id)).status_code == 401
    db_session.refresh(pix)
    assert pix.status.value == "pendente"


def test_assinatura_errada_e_401_e_nao_aprova(client, pix, db_session):
    corpo = _evento(pix.external_id)

    assert _avisar(client, corpo, assinatura=_assinar(b"outro corpo")).status_code == 401
    db_session.refresh(pix)
    assert pix.status.value == "pendente"


def test_aviso_de_producao_e_ignorado(client, pix, db_session):
    resposta = _avisar(client, _evento(pix.external_id, dev_mode=False))

    assert resposta.status_code == 200
    db_session.refresh(pix)
    assert pix.status.value == "pendente"


def test_outro_evento_e_ignorado(client, pix, db_session):
    resposta = _avisar(client, _evento(pix.external_id, event="transparent.refunded"))

    assert resposta.status_code == 200
    db_session.refresh(pix)
    assert pix.status.value == "pendente"


def test_cobranca_desconhecida_responde_200_para_nao_repetir(client, db_session):
    resposta = _avisar(client, _evento("pix_char_que_nao_existe"))

    assert resposta.status_code == 200
    assert db_session.scalars(select(Payment)).first() is None


def test_corpo_invalido_e_400(client):
    assert _avisar(client, b"isto nao e json").status_code == 400


def test_aviso_de_lista_paga_no_cartao_nao_aprova_o_pix(client, marina, lista_id, pix, db_session):
    client.post(
        f"/shopping-lists/{lista_id}/payments",
        headers=auth_headers(marina),
        json={"method": "cartao_credito", "card": CARTAO},
    )

    resposta = _avisar(client, _evento(pix.external_id))

    assert resposta.status_code == 200
    db_session.refresh(pix)
    assert pix.status.value == "pendente"


def test_dados_de_quem_pagou_nao_sao_guardados(client, pix, db_session):
    _avisar(client, _evento(pix.external_id))
    db_session.refresh(pix)

    colunas = {coluna.name: getattr(pix, coluna.name) for coluna in Payment.__table__.columns}
    assert "Maria Santos" not in str(colunas)
    assert "529" not in str(colunas["status_detail"])


def test_log_de_acesso_nao_mostra_o_segredo():
    registro = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("10.0.0.1:1", "POST", f"{URL}?webhookSecret={SEGREDO}&x=1", "1.1", 200),
        None,
    )

    assert RedactWebhookSecret().filter(registro) is True
    assert SEGREDO not in registro.getMessage()
    assert "webhookSecret=***&x=1" in registro.getMessage()
