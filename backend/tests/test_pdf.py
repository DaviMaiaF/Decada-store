"""Testes da leitura de PDF.

Os PDFs são montados aqui mesmo, byte a byte, em vez de virem de um arquivo de
apoio: assim dá para ver no teste exatamente o que está sendo lido, e o
repositório não carrega binário nem uma dependência só para gerar PDF.
"""

import pytest

from app.services.pdf import InvalidPdfError, PdfWithoutTextError, extract_lines, extract_text


def build_pdf(lines: list[str]) -> bytes:
    """Um PDF de uma página com as linhas dadas, em Helvetica."""

    def escape(text: str) -> str:
        return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

    parts = ["BT", "/F1 12 Tf", "14 TL", "1 0 0 1 50 780 Tm"]
    for line in lines:
        parts.append(f"({escape(line)}) Tj")
        parts.append("T*")
    parts.append("ET")
    stream = "\n".join(parts).encode("cp1252")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]

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


def test_le_o_texto_do_pdf():
    pdf = build_pdf(["1,2 kg de peito de frango", "200 g de aveia em flocos"])

    texto = extract_text(pdf)

    assert "peito de frango" in texto
    assert "aveia em flocos" in texto


def test_preserva_acentuacao():
    pdf = build_pdf(["Café da Manhã com pão integral", "300 g de mamão papaia"])

    texto = extract_text(pdf)

    assert "Café da Manhã" in texto
    assert "mamão" in texto


def test_devolve_linhas_sem_vazios_nem_espacos():
    pdf = build_pdf(["  1 banana prata  ", "", "2 ovos de galinha"])

    assert extract_lines(pdf) == ["1 banana prata", "2 ovos de galinha"]


def test_pdf_sem_camada_de_texto_e_recusado():
    # PDF válido e sem nada escrito: é o que sai de uma foto de papel.
    pdf = build_pdf([])

    with pytest.raises(PdfWithoutTextError) as erro:
        extract_text(pdf)

    # A mensagem precisa explicar o que fazer, não só que falhou.
    assert "OCR" in str(erro.value)


def test_pdf_quase_vazio_tambem_e_recusado():
    pdf = build_pdf(["Plano"])

    with pytest.raises(PdfWithoutTextError):
        extract_text(pdf)


def test_arquivo_que_nao_e_pdf_e_recusado():
    with pytest.raises(InvalidPdfError):
        extract_text(b"isto aqui e um texto qualquer, nao um pdf")
