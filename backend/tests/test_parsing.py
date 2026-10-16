"""Testes da leitura de uma linha do plano alimentar.

O plano chega como texto livre da nutricionista. Cada linha traz quantidade,
unidade e descrição, e é essa separação que impede o "1,2 kg" de entrar na
comparação com o catálogo e derrubar o score do produto certo.
"""

from decimal import Decimal

import pytest

from app.models.enums import MeasurementUnit
from app.services.parsing import parse_item_line

G = MeasurementUnit.GRAMA
KG = MeasurementUnit.QUILOGRAMA
ML = MeasurementUnit.MILILITRO
L = MeasurementUnit.LITRO
UN = MeasurementUnit.UNIDADE


@pytest.mark.parametrize(
    ("linha", "quantidade", "unidade", "descricao"),
    [
        ("1,2 kg de peito de frango", "1.2", KG, "peito de frango"),
        ("500 g de arroz integral", "500", G, "arroz integral"),
        ("2 l de leite desnatado", "2", L, "leite desnatado"),
        ("600 ml de creme de leite", "600", ML, "creme de leite"),
        ("1.5 kg de banana prata", "1.5", KG, "banana prata"),
        ("2 unidades de alface crespa", "2", UN, "alface crespa"),
    ],
)
def test_separa_quantidade_unidade_e_descricao(linha, quantidade, unidade, descricao):
    item = parse_item_line(linha)

    assert item.quantity == Decimal(quantidade)
    assert item.unit is unidade
    assert item.description == descricao


def test_duzia_vira_doze_unidades():
    item = parse_item_line("1 dúzia de ovos")

    assert item.quantity == Decimal("12")
    assert item.unit is UN
    assert item.description == "ovos"


def test_meia_duzia_tambem_conta_certo():
    item = parse_item_line("0,5 dúzia de ovos")

    assert item.quantity == Decimal("6")


@pytest.mark.parametrize(
    ("abreviacao", "unidade"),
    [
        ("g", G), ("gr", G), ("grama", G), ("gramas", G),
        ("kg", KG), ("quilo", KG), ("quilos", KG), ("quilograma", KG),
        ("ml", ML), ("mililitros", ML),
        ("l", L), ("lt", L), ("litro", L), ("litros", L),
        ("un", UN), ("und", UN), ("unid", UN), ("unidade", UN), ("unidades", UN),
    ],
)
def test_reconhece_as_abreviacoes_usuais(abreviacao, unidade):
    assert parse_item_line(f"2 {abreviacao} de arroz").unit is unidade


def test_palavra_desconhecida_apos_o_numero_fica_na_descricao():
    # "pote" não é unidade: vira parte da descrição e a unidade é a unidade.
    item = parse_item_line("1 pote de requeijão cremoso")

    assert item.quantity == Decimal("1")
    assert item.unit is UN
    assert item.description == "pote de requeijão cremoso"


def test_item_sem_quantidade_assume_uma_unidade():
    item = parse_item_line("banana prata")

    assert item.quantity == Decimal("1")
    assert item.unit is UN
    assert item.description == "banana prata"


def test_ignora_espacos_e_caixa_alta():
    item = parse_item_line("   600 ML DE LEITE INTEGRAL   ")

    assert item.quantity == Decimal("600")
    assert item.unit is ML
    assert item.description == "LEITE INTEGRAL"


def test_guarda_a_linha_original():
    # A descrição textual original do plano é preservada no banco.
    linha = "1,2 kg de peito de frango"
    assert parse_item_line(linha).raw == linha


@pytest.mark.parametrize("linha", ["", "   ", "\n"])
def test_linha_vazia_e_erro(linha):
    with pytest.raises(ValueError):
        parse_item_line(linha)


# --------------------------------------------------------------------------
# formato do Dietbox: descrição - medida caseira - medida de compra
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("linha", "quantidade", "unidade", "descricao"),
    [
        # A medida caseira fica de fora; a de compra, não.
        ("Arroz branco cozido - 6 colheres de sopa cheia - 150g", "150", G, "Arroz branco cozido"),
        ("Queijo muçarela - 1 fatia de 20g", "20", G, "Queijo muçarela"),
        (
            "Iogurte triplo zero OU natural - 150g - 1 pote",
            "150", G, "Iogurte triplo zero OU natural",
        ),
        ("Macarrão Cozido(a) - 200 Gramas - 2 conchas", "200", G, "Macarrão Cozido(a)"),
        ("Ovo de galinha - 2 Unidades", "2", UN, "Ovo de galinha"),
        # Massa ganha da contagem: o pão é vendido por quilo.
        ("Pão francês - 1 unidade média de 50g", "50", G, "Pão francês"),
        # Nenhuma medida de compra: 1 unidade, como no outro formato.
        ("Café - 1 Xicara De Cafe", "1", UN, "Café"),
        ("Fruta - 1 das porções abaixo", "1", UN, "Fruta"),
        ("Leite – 200 ml", "200", ML, "Leite"),
    ],
)
def test_le_o_formato_do_dietbox(linha, quantidade, unidade, descricao):
    item = parse_item_line(linha)

    assert item.quantity == Decimal(quantidade)
    assert item.unit is unidade
    assert item.description == descricao
    assert item.raw == linha


def test_hifen_sem_espaco_nao_separa_medida():
    item = parse_item_line("30 g de castanha-do-pará")

    assert item.quantity == Decimal("30")
    assert item.description == "castanha-do-pará"


def test_linha_que_comeca_com_numero_segue_o_formato_antigo():
    item = parse_item_line("150 g de frango - grelhado")

    assert item.quantity == Decimal("150")
    assert item.unit is G
    assert item.description == "frango - grelhado"
