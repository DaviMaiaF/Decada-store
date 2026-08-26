"""Testes da normalização de texto."""

import pytest

from app.services.text import normalize_text, slugify, strip_accents, tokenize


@pytest.mark.parametrize(
    ("original", "esperado"),
    [
        ("Abóbora", "Abobora"),
        ("Açaí", "Acai"),
        ("Pêssego", "Pessego"),
        ("Ovo", "Ovo"),
    ],
)
def test_remove_acento_preservando_a_letra(original, esperado):
    assert strip_accents(original) == esperado


def test_quebra_em_palavras_ignorando_pontuacao():
    assert tokenize("Arroz branco, tipo 1 (5kg)") == ["arroz", "branco", "tipo", "1", "5kg"]


def test_remove_stopwords_culinarias():
    assert normalize_text("Peito de frango sem pele") == "peito frango"
    assert normalize_text("Filé de peito de frango cru") == "file peito frango"


def test_texto_do_plano_e_do_catalogo_chegam_na_mesma_forma():
    # É esta coincidência que permite o casamento da etapa 3 funcionar.
    assert normalize_text("PEITO DE FRANGO SEM PELE") == normalize_text("Peito de frango sem pele")


def test_texto_so_de_stopword_nao_vira_vazio():
    # String vazia teria similaridade alta com qualquer produto do catálogo.
    assert normalize_text("de com sem") == "de com sem"


def test_slug_mantem_stopword_porque_serve_para_identificar():
    assert slugify("Arroz branco tipo 1", "Grão Fino", "5kg") == "arroz-branco-tipo-1-grao-fino-5kg"


def test_slug_ignora_partes_ausentes():
    assert slugify("Banana prata", None, "granel") == "banana-prata-granel"
