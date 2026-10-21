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
from app.services.pantry_photo import (
    ImageTooLargeError,
    InvalidImageError,
    RecognitionUnavailableError,
)
from app.services.pdf import InvalidPdfError, PdfWithoutTextError
from app.services.prescriptions import PrescriptionLockedError
from app.services.shopping import PrescribedItemError, ProductAlreadyInListError
from app.services.units import IncompatibleUnitError

# Cada exceção do domínio e o código que ela merece.
_STATUS_BY_EXCEPTION: tuple[tuple[type[Exception], int], ...] = (
    # O arquivo chegou, é legível, mas não dá para trabalhar com ele.
    (PdfWithoutTextError, status.HTTP_422_UNPROCESSABLE_CONTENT),
    # O arquivo não é um PDF: erro de quem enviou.
    (InvalidPdfError, status.HTTP_400_BAD_REQUEST),
    # A foto da despensa: arquivo que não é imagem é erro de quem enviou; grande
    # demais tem código próprio; e o reconhecimento fora do ar não é culpa de
    # ninguém do lado do app — 503 diz à tela que vale tentar de novo.
    (InvalidImageError, status.HTTP_400_BAD_REQUEST),
    (ImageTooLargeError, status.HTTP_413_CONTENT_TOO_LARGE),
    (RecognitionUnavailableError, status.HTTP_503_SERVICE_UNAVAILABLE),
    # Unidade de outra grandeza: o pedido não faz sentido no domínio.
    (IncompatibleUnitError, status.HTTP_422_UNPROCESSABLE_CONTENT),
    # Produto repetido na lista: conflito com o que já está lá, não erro de
    # formato. 409 é o que diz à tela para mostrar o item existente.
    (ProductAlreadyInListError, status.HTTP_409_CONFLICT),
    # Tirar da lista um item prescrito: o pedido é compreensível e recusado.
    (PrescribedItemError, status.HTTP_422_UNPROCESSABLE_CONTENT),
    # Plano já aceito pelo paciente: o pedido entra em conflito com o estado dele.
    (PrescriptionLockedError, status.HTTP_409_CONFLICT),
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
