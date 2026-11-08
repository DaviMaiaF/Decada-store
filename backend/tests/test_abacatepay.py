"""Testes do cliente do Abacate Pay. Nenhum deles sai para a rede.

A API é trocada pelo `MockTransport` do httpx, com as respostas no formato da
documentação. A regra que mais importa está aqui: resposta de produção não passa.
"""

import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from decimal import Decimal

import httpx
import pytest

from app.services.abacatepay import (
    API_URL,
    WEBHOOK_PUBLIC_KEY,
    AbacatePayClient,
    PaymentProviderError,
    build_pix_provider,
    to_cents,
    valid_webhook_secret,
    valid_webhook_signature,
)

COBRANCA = {
    "id": "pix_char_teste",
    "amount": 8740,
    "status": "PENDING",
    "devMode": True,
    "brCode": "00020101-codigo-de-teste",
    "brCodeBase64": "data:image/png;base64,AAAA",
    "platformFee": 80,
    "expiresAt": "2026-11-08T15:00:00.000Z",
}


def _cliente(responder) -> AbacatePayClient:
    return AbacatePayClient(
        httpx.Client(base_url=API_URL, transport=httpx.MockTransport(responder))
    )


def _ok(data: dict) -> httpx.Response:
    return httpx.Response(200, json={"data": data, "success": True, "error": None})


def test_criar_pix_envia_centavos_e_nenhum_dado_da_pessoa():
    pedidos = []

    def responder(pedido: httpx.Request) -> httpx.Response:
        pedidos.append(pedido)
        return _ok(COBRANCA)

    cobranca = _cliente(responder).create_pix(Decimal("87.40"), 3600)

    assert pedidos[0].url.path == "/v2/transparents/create"
    assert json.loads(pedidos[0].content) == {
        "method": "PIX",
        "data": {"amount": 8740, "expiresIn": 3600},
    }
    assert cobranca.external_id == "pix_char_teste"
    assert cobranca.br_code == "00020101-codigo-de-teste"
    assert cobranca.expires_at == datetime(2026, 11, 8, 15, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize("modo", [False, None])
def test_cobranca_fora_do_modo_de_teste_nao_devolve_o_codigo(modo):
    resposta = {**COBRANCA, "devMode": modo}

    with pytest.raises(PaymentProviderError, match="modo de teste"):
        _cliente(lambda _: _ok(resposta)).create_pix(Decimal("87.40"), 3600)


def test_simulacao_fora_do_modo_de_teste_e_recusada():
    resposta = {**COBRANCA, "status": "PAID", "devMode": False}

    with pytest.raises(PaymentProviderError, match="modo de teste"):
        _cliente(lambda _: _ok(resposta)).simulate_pix("pix_char_teste")


def test_consultar_devolve_o_status():
    def responder(pedido: httpx.Request) -> httpx.Response:
        assert pedido.url.path == "/v2/transparents/check"
        assert pedido.url.params["id"] == "pix_char_teste"
        return _ok({"id": "pix_char_teste", "status": "PAID"})

    assert _cliente(responder).check_pix("pix_char_teste") == "PAID"


def test_simular_devolve_o_status():
    def responder(pedido: httpx.Request) -> httpx.Response:
        assert pedido.url.path == "/v2/transparents/simulate-payment"
        assert pedido.url.params["id"] == "pix_char_teste"
        return _ok({**COBRANCA, "status": "PAID"})

    assert _cliente(responder).simulate_pix("pix_char_teste") == "PAID"


@pytest.mark.parametrize(
    "resposta",
    [
        httpx.Response(401, json={"data": None, "success": False, "error": "token inválido"}),
        httpx.Response(500, text="erro"),
        httpx.Response(200, text="isto não é json"),
        httpx.Response(200, json={"data": None, "success": False, "error": "recusado"}),
        httpx.Response(200, json={"data": {"id": "sem-o-resto", "devMode": True}}),
    ],
    ids=["401", "500", "nao-json", "success-false", "campos-faltando"],
)
def test_resposta_ruim_vira_erro_do_provedor(resposta):
    with pytest.raises(PaymentProviderError):
        _cliente(lambda _: resposta).create_pix(Decimal("87.40"), 3600)


def test_falha_de_rede_vira_erro_do_provedor():
    def responder(pedido: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("sem rede", request=pedido)

    with pytest.raises(PaymentProviderError):
        _cliente(responder).check_pix("pix_char_teste")


def test_mensagem_de_erro_nao_expoe_a_chave():
    def responder(pedido: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(pedido.headers["Authorization"], request=pedido)

    cliente = AbacatePayClient(
        httpx.Client(
            base_url=API_URL,
            headers={"Authorization": "Bearer chave-secreta"},
            transport=httpx.MockTransport(responder),
        )
    )

    with pytest.raises(PaymentProviderError) as erro:
        cliente.check_pix("pix_char_teste")
    assert "chave-secreta" not in str(erro.value)


@pytest.mark.parametrize("chave", [None, ""])
def test_sem_chave_nao_ha_provedor(chave):
    assert build_pix_provider(chave) is None


def test_com_chave_ha_provedor():
    assert build_pix_provider("chave-de-teste") is not None


@pytest.mark.parametrize(
    ("valor", "centavos"),
    [(Decimal("87.40"), 8740), (Decimal("1.00"), 100), (Decimal("0.07"), 7)],
)
def test_centavos(valor, centavos):
    assert to_cents(valor) == centavos


@pytest.mark.parametrize(
    ("recebido", "esperado", "valido"),
    [
        ("segredo", "segredo", True),
        ("outro", "segredo", False),
        (None, "segredo", False),
        ("segredo", None, False),
        (None, None, False),
        ("", "", False),
    ],
)
def test_segredo_do_webhook(recebido, esperado, valido):
    assert valid_webhook_secret(recebido, esperado) is valido


def _assinar(corpo: bytes) -> str:
    digest = hmac.new(WEBHOOK_PUBLIC_KEY.encode(), corpo, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def test_assinatura_valida_do_webhook():
    corpo = b'{"event":"transparent.completed"}'
    assert valid_webhook_signature(corpo, _assinar(corpo)) is True


def test_assinatura_de_outro_corpo_e_recusada():
    assinatura = _assinar(b'{"event":"transparent.completed"}')
    assert valid_webhook_signature(b'{"event":"forjado"}', assinatura) is False


@pytest.mark.parametrize("assinatura", [None, "", "não-é-base64-nem-ascii-ç"])
def test_assinatura_ausente_ou_ilegivel_e_recusada(assinatura):
    assert valid_webhook_signature(b"{}", assinatura) is False
