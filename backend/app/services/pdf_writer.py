"""Escrita de PDF com texto, de várias páginas.

Montado byte a byte, como o PDF de demonstração do seed: o projeto não precisa
de biblioteca de geração de PDF para mais nada. O que sai daqui é PDF com
camada de texto, o único que o import lê (decisão 7).

Quebra de linha é por contagem de caracteres, não por métrica da fonte. Fica
um pouco antes da margem em texto estreito, e é o bastante para orientação em
prosa; linha de item nunca chega perto do limite (ver schemas/prescription.py).
"""

from collections.abc import Sequence
from dataclasses import dataclass

_PAGE_WIDTH = 595
_PAGE_HEIGHT = 842
_MARGIN = 50
# Largura média de um caractere da Helvetica, em fração do corpo da fonte.
_AVERAGE_CHAR_WIDTH = 0.5


@dataclass(frozen=True)
class Line:
    text: str
    bold: bool = False
    size: int = 11
    # Espaço extra acima da linha, em pontos: separa uma refeição da outra.
    space_before: int = 0


def _wrap(text: str, max_chars: int) -> list[str]:
    palavras = text.split()
    linhas: list[str] = []
    atual = ""
    for palavra in palavras:
        candidata = f"{atual} {palavra}".strip()
        if len(candidata) > max_chars and atual:
            linhas.append(atual)
            atual = palavra
        else:
            atual = candidata
    if atual:
        linhas.append(atual)
    return linhas or [""]


def _escape(text: str) -> str:
    return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def write_pdf(lines: Sequence[Line]) -> bytes:
    """O PDF com as linhas dadas, em quantas páginas forem precisas."""
    largura_util = _PAGE_WIDTH - 2 * _MARGIN
    paginas: list[list[str]] = [[]]
    y = _PAGE_HEIGHT - _MARGIN

    for line in lines:
        leading = round(line.size * 1.4)
        max_chars = int(largura_util / (line.size * _AVERAGE_CHAR_WIDTH))
        fonte = "/F2" if line.bold else "/F1"
        for indice, trecho in enumerate(_wrap(line.text, max_chars)):
            passo = leading + (line.space_before if indice == 0 else 0)
            if y - passo < _MARGIN:
                paginas.append([])
                y = _PAGE_HEIGHT - _MARGIN
                passo = leading
            y -= passo
            paginas[-1].append(
                f"BT {fonte} {line.size} Tf {_MARGIN} {y} Td ({_escape(trecho)}) Tj ET"
            )

    # Objetos 1 e 2 são catálogo e árvore de páginas; 3 e 4, as fontes. Cada
    # página ocupa dois objetos a partir do 5: a página e o conteúdo dela.
    kids = " ".join(f"{5 + 2 * i} 0 R" for i in range(len(paginas)))
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {len(paginas)} >>".encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold "
        b"/Encoding /WinAnsiEncoding >>",
    ]
    for indice, comandos in enumerate(paginas):
        # WinAnsi cobre o português; o que ficar de fora vira "?" em vez de
        # derrubar a geração do PDF inteiro.
        stream = "\n".join(comandos).encode("cp1252", errors="replace")
        conteudo = 6 + 2 * indice
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {_PAGE_WIDTH} {_PAGE_HEIGHT}] "
            f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> "
            f"/Contents {conteudo} 0 R >>".encode()
        )
        objects.append(
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
        )

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for numero, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{numero} 0 obj\n".encode() + obj + b"\nendobj\n"

    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    ).encode()
    return bytes(out)
