"""Avisos do Abacate Pay, em modo de teste.

A rota não tem token de usuário: quem chama é o provedor. O `webhookSecret` da
URL prova a origem, e a assinatura prova que o corpo não mudou no caminho — a
chave dela é pública, então sozinha não autentica ninguém.

Qualquer 2xx encerra as retentativas; 5xx e falta de resposta fazem o Abacate Pay
tentar de novo, por até 18 horas. Por isso o que não interessa responde 200, e
receber o mesmo aviso duas vezes não muda nada: só pagamento pendente é aprovado.

Do corpo só se lê o que está em `AbacatePayEvent`. O nome e o CPF de quem pagou
também vêm nele, e são descartados aqui (decisão 5, minimização).
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import ValidationError
from sqlalchemy import select

from app.api.deps import DbSession
from app.core.config import Settings, get_settings
from app.models import Payment
from app.schemas.payment import AbacatePayEvent
from app.services.abacatepay import valid_webhook_secret, valid_webhook_signature
from app.services.payment_gateway import apply_pix_status

logger = logging.getLogger(__name__)

router = APIRouter(tags=["pagamentos"])

PIX_COMPLETED_EVENT = "transparent.completed"


async def _raw_body(request: Request) -> bytes:
    """O corpo como chegou: a assinatura é calculada sobre os bytes, não sobre o JSON."""
    return await request.body()


@router.post("/webhooks/abacatepay", include_in_schema=False)
def receive_abacatepay_event(
    session: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
    raw_body: Annotated[bytes, Depends(_raw_body)],
    webhook_secret: Annotated[str | None, Query(alias="webhookSecret")] = None,
    signature: Annotated[str | None, Header(alias="X-Webhook-Signature")] = None,
) -> dict[str, bool]:
    """Aprova o pagamento pendente da cobrança que o Abacate Pay confirmou."""
    if not valid_webhook_secret(webhook_secret, settings.abacatepay_webhook_secret):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "não autorizado")
    if not valid_webhook_signature(raw_body, signature):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "não autorizado")

    try:
        event = AbacatePayEvent.model_validate_json(raw_body)
    except ValidationError as erro:
        # Sem repetir a entrada: o corpo pode trazer os dados de quem pagou.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "aviso inválido") from erro

    # A trava do modo de teste, do lado do aviso.
    if event.dev_mode is not True:
        logger.warning("aviso do Abacate Pay fora do modo de teste foi ignorado")
        return {"received": True}

    charge = event.data.transparent if event.data else None
    if event.event != PIX_COMPLETED_EVENT or charge is None:
        return {"received": True}

    payment = session.scalars(select(Payment).where(Payment.external_id == charge.id)).first()
    # Pagamento apagado junto com a conta: não há o que aprovar, e repetir não ajuda.
    if payment is not None:
        apply_pix_status(session, payment, charge.status)
        session.commit()
    return {"received": True}
