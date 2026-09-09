"""Tradução das exceções de domínio em respostas HTTP.

Registradas uma vez, no `main`. As rotas não capturam nada: se um serviço
levantar uma exceção conhecida, o código HTTP dela já está decidido aqui.

Exceção de domínio que não estiver nesta tabela vira 500, e isso é proposital —
é o sinal de que alguém precisa decidir qual é o código certo, em vez de deixar
o usuário receber uma mensagem genérica para sempre.
"""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.seeds.runner import SeedNotAllowedError
from app.services.pdf import InvalidPdfError, PdfWithoutTextError
from app.services.units import IncompatibleUnitError

# Cada exceção do domínio e o código que ela merece.
_STATUS_BY_EXCEPTION: tuple[tuple[type[Exception], int], ...] = (
    # O arquivo chegou, é legível, mas não dá para trabalhar com ele.
    (PdfWithoutTextError, status.HTTP_422_UNPROCESSABLE_CONTENT),
    # O arquivo não é um PDF: erro de quem enviou.
    (InvalidPdfError, status.HTTP_400_BAD_REQUEST),
    # Unidade de outra grandeza: o pedido não faz sentido no domínio.
    (IncompatibleUnitError, status.HTTP_422_UNPROCESSABLE_CONTENT),
    # Seed disparado fora de desenvolvimento: nunca deveria chegar por HTTP.
    (SeedNotAllowedError, status.HTTP_403_FORBIDDEN),
)


def register_error_handlers(app: FastAPI) -> None:
    """Liga cada exceção de domínio ao seu código HTTP."""

    def build(status_code: int):
        async def handler(_: Request, exc: Exception) -> JSONResponse:
            return JSONResponse(status_code=status_code, content={"detail": str(exc)})

        return handler

    for exception_type, status_code in _STATUS_BY_EXCEPTION:
        app.add_exception_handler(exception_type, build(status_code))
