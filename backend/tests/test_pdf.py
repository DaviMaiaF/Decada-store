"""Testes da leitura de PDF.

Os PDFs de teste são montados byte a byte por `tests/helpers.py`, em vez de
virem de um arquivo de apoio: assim dá para ver no teste exatamente o que está
sendo lido, e o repositório não carrega binário.
"""

import pytest

from app.services.pdf import InvalidPdfError, PdfWithoutTextError, extract_lines, extract_text
from tests.helpers import build_pdf


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
