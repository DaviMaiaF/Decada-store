"""Cliente do Abacate Pay, **só em modo de teste** (Dev Mode).

A DÉCADA não cobra ninguém: o servidor publicado é demonstração (decisão 13) e
não há pedido nem entrega por trás da compra. Por isso a resposta com
`devMode: false` é recusada aqui, no ponto por onde todo Pix passa. Se alguém
configurar uma chave de produção, o código Pix não chega à tela.

Nenhum dado da pessoa sai daqui. O campo `customer` é opcional no Pix e não é
enviado (decisão 5, minimização): o Abacate Pay recebe só o valor e a validade.
"""

import base64
import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Protocol

import httpx

API_URL = "https://api.abacatepay.com/v2"

# Tempo de resposta da API. A pessoa está olhando para a tela esperando.
REQUEST_TIMEOUT_SECONDS = 15.0

# Chave pública do Abacate Pay, a mesma para todos os clientes, publicada em
# https://docs.abacatepay.com/pages/webhooks/security. Não é segredo: a assinatura
# prova que o corpo não mudou, e quem prova a origem é o `webhookSecret`.
WEBHOOK_PUBLIC_KEY = "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9"  # noqa: E501


class PaymentProviderError(RuntimeError):
    """O Abacate Pay não respondeu, recusou o pedido ou não está configurado.

    Não é erro de quem paga: vira 503, que diz à tela que vale tentar de novo.
    """


@dataclass(frozen=True)
class PixCharge:
    """A cobrança Pix como o Abacate Pay a devolve ao criar."""

    external_id: str
    br_code: str
    status: str
    expires_at: datetime


class PixProvider(Protocol):
    """Quem cria, consulta e simula a cobrança Pix."""

    def create_pix(self, amount: Decimal, expires_in_seconds: int) -> PixCharge: ...

    def check_pix(self, external_id: str) -> str: ...

    def simulate_pix(self, external_id: str) -> str: ...


def to_cents(amount: Decimal) -> int:
    """Valor em centavos, a unidade da API."""
    return int((amount * 100).to_integral_value())


def _require_test_mode(data: dict) -> None:
    """Recusa resposta de produção: é a trava do modo de teste."""
    if data.get("devMode") is not True:
        raise PaymentProviderError("o Abacate Pay só pode ser usado em modo de teste")


class AbacatePayClient:
    """Implementação de `PixProvider` sobre a API v2."""

    def __init__(self, client: httpx.Client) -> None:
        self._client = client

    def _request(self, method: str, path: str, **kwargs) -> dict:
        """O campo `data` da resposta, ou `PaymentProviderError`.

        A mensagem não repete a resposta da API nem a exceção original, que
        podem trazer a URL e os cabeçalhos da requisição.
        """
        try:
            response = self._client.request(method, path, **kwargs)
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as erro:
            raise PaymentProviderError("o Abacate Pay não respondeu; tente de novo") from erro

        data = body.get("data") if isinstance(body, dict) else None
        if not isinstance(data, dict) or body.get("success") is False:
            raise PaymentProviderError("o Abacate Pay recusou o pedido; tente de novo")
        return data

    def create_pix(self, amount: Decimal, expires_in_seconds: int) -> PixCharge:
        data = self._request(
            "POST",
            "/transparents/create",
            json={
                "method": "PIX",
                "data": {"amount": to_cents(amount), "expiresIn": expires_in_seconds},
            },
        )
        _require_test_mode(data)

        try:
            return PixCharge(
                external_id=data["id"],
                br_code=data["brCode"],
                status=data["status"],
                expires_at=datetime.fromisoformat(data["expiresAt"].replace("Z", "+00:00")),
            )
        except (KeyError, AttributeError, ValueError) as erro:
            raise PaymentProviderError("o Abacate Pay respondeu de um jeito inesperado") from erro

    def check_pix(self, external_id: str) -> str:
        data = self._request("GET", "/transparents/check", params={"id": external_id})
        return _read_status(data)

    def simulate_pix(self, external_id: str) -> str:
        # Em produção essa rota responde erro; a trava vale do mesmo jeito.
        data = self._request("POST", "/transparents/simulate-payment", params={"id": external_id})
        _require_test_mode(data)
        return _read_status(data)


def _read_status(data: dict) -> str:
    status = data.get("status")
    if not isinstance(status, str):
        raise PaymentProviderError("o Abacate Pay respondeu de um jeito inesperado")
    return status


def build_pix_provider(api_key: str | None) -> PixProvider | None:
    """O cliente configurado, ou None se não houver chave.

    Sem chave só o Pix fica indisponível: o cartão, simulado, não passa por aqui.
    """
    if not api_key:
        return None
    return AbacatePayClient(
        httpx.Client(
            base_url=API_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    )


def valid_webhook_secret(received: str | None, expected: str | None) -> bool:
    """O `webhookSecret` da URL bate com o nosso. Sem segredo configurado, nunca."""
    if not received or not expected:
        return False
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))


def valid_webhook_signature(raw_body: bytes, signature: str | None) -> bool:
    """`X-Webhook-Signature`: HMAC-SHA256 do corpo bruto, em base64."""
    if not signature:
        return False
    digest = hmac.new(WEBHOOK_PUBLIC_KEY.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(expected.encode("utf-8"), signature.encode("utf-8"))
