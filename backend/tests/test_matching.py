"""Testes do casamento entre item do plano e produto do catálogo.

Rodam sobre os 120 produtos do seed, mas sem banco: o casamento é uma função
pura sobre uma lista de produtos.
"""

from decimal import Decimal

import pytest

from app.models.enums import MeasurementUnit, PlanItemStatus
from app.services.matching import MAX_CANDIDATES, MINIMUM_SCORE, match_text


def _melhor(catalogo, texto):
    return match_text(texto, catalogo).candidates[0]


def test_encontra_o_produto_certo(catalogo):
    resultado = match_text("1,2 kg de peito de frango", catalogo)

    assert resultado.candidates[0].product.name == "Peito de frango sem pele"
    assert resultado.candidates[0].score >= MINIMUM_SCORE


def test_devolve_no_maximo_cinco_candidatos(catalogo):
    resultado = match_text("1 kg de arroz", catalogo)

    assert 0 < len(resultado.candidates) <= MAX_CANDIDATES


def test_candidatos_vem_do_melhor_para_o_pior(catalogo):
    scores = [c.score for c in match_text("1 kg de arroz", catalogo).candidates]

    assert scores == sorted(scores, reverse=True)


def test_nunca_escolhe_sozinho(catalogo):
    # O casamento não confirma nada: quem confirma é o usuário, na etapa 6.
    resultado = match_text("1,2 kg de peito de frango", catalogo)

    assert resultado.status is PlanItemStatus.PENDENTE
    assert len(resultado.candidates) > 1


def test_acento_no_plano_encontra_o_produto(catalogo):
    assert _melhor(catalogo, "500 g de maçã gala").product.name == "Maçã gala"


def test_texto_sem_acento_encontra_o_produto_acentuado(catalogo):
    # O usuário digita com pressa, sem acento; o catálogo tem acento.
    assert _melhor(catalogo, "500 g de maca gala").product.name == "Maçã gala"


def test_plural_encontra_o_singular_do_catalogo(catalogo):
    assert _melhor(catalogo, "2 kg de bananas prata").product.name == "Banana prata"


def test_marca_no_meio_do_texto_nao_atrapalha(catalogo):
    # "Grão Fino" é a marca; o produto certo é o arroz integral, não o branco.
    assert _melhor(catalogo, "1 kg de arroz Grão Fino integral").product.name == "Arroz integral"


def test_stopword_culinaria_nao_atrapalha(catalogo):
    melhor = _melhor(catalogo, "1,2 kg de peito de frango sem pele cru")

    assert melhor.product.name == "Peito de frango sem pele"


def test_item_fora_do_catalogo_fica_nao_identificado(catalogo):
    resultado = match_text("200 g de creatina micronizada", catalogo)

    assert resultado.status is PlanItemStatus.NAO_IDENTIFICADO
    assert resultado.candidates[0].score < MINIMUM_SCORE


def test_item_nao_identificado_ainda_devolve_os_candidatos_fracos(catalogo):
    # A tela precisa mostrar "nenhum passou de 0,60" com as opções à mão,
    # senão o usuário fica sem saída.
    resultado = match_text("200 g de creatina micronizada", catalogo)

    assert resultado.candidates != []


def test_converte_a_quantidade_para_a_unidade_base(catalogo):
    melhor = _melhor(catalogo, "500 g de queijo minas frescal")

    assert melhor.product.base_unit.value == "kg"
    assert melhor.quantity_in_base == Decimal("0.5")


def test_calcula_quantas_embalagens_comprar(catalogo):
    # Queijo minas frescal vem em pacote de 500 g: 1,2 kg exige 3 pacotes.
    melhor = _melhor(catalogo, "1,2 kg de queijo minas frescal")

    assert melhor.packages_needed == 3


def test_produto_a_granel_nao_tem_embalagem_a_contar(catalogo):
    melhor = _melhor(catalogo, "1,2 kg de peito de frango")

    assert melhor.product.package_size is None
    assert melhor.packages_needed is None


def test_unidade_incompativel_e_sinalizada_sem_sumir_da_lista(catalogo):
    # Leite é vendido em litro; o plano pediu em grama. O produto continua
    # visível, marcado como incompatível, para o usuário corrigir a unidade.
    resultado = match_text("500 g de leite integral UHT", catalogo)
    leite = next(c for c in resultado.candidates if c.product.name == "Leite integral UHT")

    assert leite.unit_compatible is False
    assert leite.quantity_in_base is None


def test_quilo_e_grama_sao_a_mesma_grandeza(catalogo):
    em_quilo = _melhor(catalogo, "1,2 kg de peito de frango")
    em_grama = _melhor(catalogo, "1200 g de peito de frango")

    assert em_quilo.quantity_in_base == em_grama.quantity_in_base == Decimal("1.2")


def test_litro_e_mililitro_sao_a_mesma_grandeza(catalogo):
    em_litro = _melhor(catalogo, "2 l de leite integral UHT")
    em_mililitro = _melhor(catalogo, "2000 ml de leite integral UHT")

    assert em_litro.quantity_in_base == em_mililitro.quantity_in_base == Decimal("2")


def test_score_fica_entre_zero_e_um(catalogo):
    for candidato in match_text("1 kg de arroz", catalogo).candidates:
        assert Decimal("0") <= candidato.score <= Decimal("1")


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("1 dúzia de ovos", "Ovos de galinha"),
        ("2 l de leite desnatado", "Leite desnatado UHT"),
        ("300 g de queijo minas", "Queijo minas frescal"),
        ("1 kg de banana prata", "Banana prata"),
        ("500 g de arroz integral", "Arroz integral"),
    ],
)
def test_plano_de_exemplo_ponta_a_ponta(catalogo, texto, esperado):
    assert _melhor(catalogo, texto).product.name == esperado


def test_unidade_do_plano_e_preservada_no_resultado(catalogo):
    resultado = match_text("1,2 kg de peito de frango", catalogo)

    assert resultado.quantity == Decimal("1.2")
    assert resultado.unit is MeasurementUnit.QUILOGRAMA


@pytest.mark.db
def test_casa_um_item_ja_gravado_no_banco(db_session):
    """O caminho que passa pelo banco: catálogo vem do Postgres, não da fixture."""
    from datetime import datetime, timezone

    from app.models import MealPlan, PlanItem, User
    from app.seeds.runner import run as carregar_seed
    from app.services.matching import match_plan_item

    carregar_seed(db_session)

    usuario = User(email="teste@nutricart.local")
    plano = MealPlan(
        user=usuario,
        consent_at=datetime.now(timezone.utc),
        consent_version="v1",
        items=[
            PlanItem(
                position=1,
                raw_description="1,2 kg de peito de frango",
                quantity=Decimal("1.2"),
                unit=MeasurementUnit.QUILOGRAMA,
            )
        ],
    )
    db_session.add(plano)
    db_session.flush()

    resultado = match_plan_item(db_session, plano.items[0])

    assert resultado.candidates[0].product.name == "Peito de frango sem pele"
    assert resultado.status is PlanItemStatus.PENDENTE
    assert resultado.quantity == Decimal("1.2")
