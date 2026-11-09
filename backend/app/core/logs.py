"""Ajustes de log da aplicação."""

import logging
import re

_WEBHOOK_SECRET = re.compile(r"webhookSecret=[^&\s]*")


class RedactWebhookSecret(logging.Filter):
    """Tira o `webhookSecret` da linha de acesso.

    O Abacate Pay manda o segredo na URL, e o uvicorn registra a URL inteira. Com
    ele no log, qualquer um que leia o log forjaria um aviso de pagamento.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(
                _WEBHOOK_SECRET.sub("webhookSecret=***", arg) if isinstance(arg, str) else arg
                for arg in record.args
            )
        return True


def install_log_filters() -> None:
    logging.getLogger("uvicorn.access").addFilter(RedactWebhookSecret())
