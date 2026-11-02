"""Leitura do texto de um PDF.

Só PDF pesquisável, isto é, com camada de texto. PDF que é foto de papel não é
lido aqui: OCR está fora do MVP e fingir que o arquivo veio vazio faria o
usuário achar que o plano dele não tem nada dentro.
"""

import io
import re

from pypdf import PdfReader
from pypdf.errors import PdfReadError

# Abaixo disto o arquivo é tratado como digitalizado. Não é zero porque PDF de
# scanner costuma trazer um punhado de caracteres de metadado no meio das
# imagens, e isso não é o plano alimentar.
MINIMUM_CHARACTERS = 20

_SPACES = re.compile(r"\s+")


class InvalidPdfError(ValueError):
    """O arquivo não é um PDF legível."""


class PdfWithoutTextError(ValueError):
    """O PDF não tem camada de texto — provavelmente é digitalizado."""


def extract_pages(data: bytes) -> list[list[str]]:
    """As linhas de cada página como o modo `layout` as monta, com o recuo.

    Usa o modo `layout`, que monta as linhas pela posição na página. O modo
    padrão do pypdf segue a ordem interna dos trechos de texto, e PDF gerado por
    sistema (o Dietbox, por exemplo) quebra ali o item no meio: "Ovo de galinha"
    numa linha e "- 2 Unidades" na seguinte, que viravam dois itens.

    Os espaços ficam como vieram: é por eles que o import sabe em que coluna
    está cada trecho, na tabela de opção principal e substituição do Dietbox.
    """
    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text(extraction_mode="layout") or "" for page in reader.pages]
    except PdfReadError as erro:
        raise InvalidPdfError(f"não foi possível ler o PDF: {erro}") from erro

    if len("".join(pages).strip()) < MINIMUM_CHARACTERS:
        raise PdfWithoutTextError(
            "o PDF não tem texto selecionável. Fotos e documentos digitalizados "
            "precisariam de OCR, que não faz parte desta versão — peça o plano "
            "em PDF ou digite os itens."
        )

    return [[line.rstrip() for line in page.splitlines() if line.strip()] for page in pages]


def extract_text(data: bytes) -> str:
    """Todo o texto do PDF, com as páginas separadas por quebra de linha."""
    return "\n".join("\n".join(page) for page in extract_pages(data))


def collapse_spaces(line: str) -> str:
    """A linha sem espaço sobrando.

    O modo layout alinha colunas com espaços, então os espaços repetidos no meio
    da linha também viram um só.
    """
    return _SPACES.sub(" ", line).strip()


def extract_lines(data: bytes) -> list[str]:
    """As linhas do PDF, sem as vazias e sem espaço sobrando."""
    return [collapse_spaces(line) for page in extract_pages(data) for line in page]
