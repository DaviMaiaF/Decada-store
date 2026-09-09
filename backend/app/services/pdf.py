"""Leitura do texto de um PDF.

Só PDF pesquisável, isto é, com camada de texto. PDF que é foto de papel não é
lido aqui: OCR está fora do MVP e fingir que o arquivo veio vazio faria o
usuário achar que o plano dele não tem nada dentro.
"""

import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError

# Abaixo disto o arquivo é tratado como digitalizado. Não é zero porque PDF de
# scanner costuma trazer um punhado de caracteres de metadado no meio das
# imagens, e isso não é o plano alimentar.
MINIMUM_CHARACTERS = 20


class InvalidPdfError(ValueError):
    """O arquivo não é um PDF legível."""


class PdfWithoutTextError(ValueError):
    """O PDF não tem camada de texto — provavelmente é digitalizado."""


def extract_text(data: bytes) -> str:
    """Todo o texto do PDF, com as páginas separadas por quebra de linha."""
    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
    except PdfReadError as erro:
        raise InvalidPdfError(f"não foi possível ler o PDF: {erro}") from erro

    text = "\n".join(pages)

    if len(text.strip()) < MINIMUM_CHARACTERS:
        raise PdfWithoutTextError(
            "o PDF não tem texto selecionável. Fotos e documentos digitalizados "
            "precisariam de OCR, que não faz parte desta versão — peça o plano "
            "em PDF ou digite os itens."
        )

    return text


def extract_lines(data: bytes) -> list[str]:
    """As linhas do PDF, sem as vazias e sem espaço sobrando nas pontas."""
    return [line.strip() for line in extract_text(data).splitlines() if line.strip()]
