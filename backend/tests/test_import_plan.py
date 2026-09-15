"""Testes do import do plano alimentar a partir do PDF.

O filtro de ruído é testado sem banco. O import completo usa Postgres, porque
depende do catálogo para saber o que conseguiu identificar.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.models import MealPlan, PlanItem
from app.models.enums import PlanItemStatus
from app.services.import_plan import _discard_reason, import_plan_from_pdf
from app.services.pdf import PdfWithoutTextError
from tests.helpers import PLANO_REALISTA, build_pdf

AGORA = datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)

# --------------------------------------------------------------------------
# filtro de ruído
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "linha, motivo",
    [
        ("Café da Manhã", "cabeçalho de refeição"),
        ("Almoço:", "cabeçalho de refeição"),
        ("07:30 - Lanche da tarde", "cabeçalho de refeição"),
        ("CEIA", "cabeçalho de refeição"),
        ("Orientações gerais:", "cabeçalho de seção"),
        ("Página 1 de 2", "número de página"),
        ("2 de 4", "número de página"),
        ("12/10/2025", "data"),
        ("CRN-3 48291", "identificação do profissional"),
        ("contato@nutricionista.com.br", "identificação do profissional"),
        ("(61) 99999-0000", "identificação do profissional"),
        ("Dra. Camila Fernandes", "identificação do profissional"),
        ("Plano Alimentar Personalizado", "título do documento"),
        ("---", "sem texto"),
    ],
)
def test_reconhece_o_que_nao_e_item(linha, motivo):
    assert _discard_reason(linha) == motivo


def test_orientacao_longa_e_descartada():
    prosa = (
        "Beba pelo menos dois litros de água ao longo do dia e evite líquidos "
        "durante as refeições principais para não atrapalhar a digestão."
    )
    assert _discard_reason(prosa) == "texto de orientação"


@pytest.mark.parametrize(
    "linha",
    [
        "1,2 kg de peito de frango",
        "200 g de aveia em flocos",
        "2 ovos de galinha",
        "banana prata",
        "1 filé de tilápia grelhado",
    ],
)
def test_deixa_passar_o_que_e_item(linha):
    assert _discard_reason(linha) is None


def test_na_duvida_a_linha_vira_item():
    # Palavra solta que não é cabeçalho conhecido: vira item e o casamento
    # decide. Descartar seria tirar comida do plano de alguém sem avisar.
    assert _discard_reason("Suplemento prescrito") is None


# --------------------------------------------------------------------------
# import completo
# --------------------------------------------------------------------------

@pytest.fixture
def usuario(db_session):
    from tests.conftest import novo_usuario

    pessoa = novo_usuario("marina@example.com")
    db_session.add(pessoa)
    db_session.flush()
    return pessoa


@pytest.mark.db
def test_importa_os_itens_e_ignora_o_cabecalho(db_session, usuario):
    resultado = import_plan_from_pdf(
        db_session, usuario, build_pdf(PLANO_REALISTA), consent_at=AGORA
    )

    descricoes = [item.raw_description for item in resultado.meal_plan.items]
    assert descricoes == [
        "2 ovos de galinha",
        "200 ml de leite integral UHT",
        "1 banana prata",
        "150 g de peito de frango sem pele",
        "100 g de arroz integral",
    ]
    assert resultado.items_created == 5


@pytest.mark.db
def test_relata_o_que_foi_descartado(db_session, usuario):
    resultado = import_plan_from_pdf(
        db_session, usuario, build_pdf(PLANO_REALISTA), consent_at=AGORA
    )

    motivos = {linha.reason for linha in resultado.discarded}
    assert "cabeçalho de refeição" in motivos
    assert "número de página" in motivos
    assert "identificação do profissional" in motivos
    assert "título do documento" in motivos
    assert "texto de orientação" in motivos
    # Nada some em silêncio: toda linha do PDF ou virou item ou está no relatório.
    assert len(resultado.discarded) + resultado.items_created == len(PLANO_REALISTA)


@pytest.mark.db
def test_guarda_o_pdf_inteiro_para_auditoria(db_session, usuario):
    resultado = import_plan_from_pdf(
        db_session, usuario, build_pdf(PLANO_REALISTA), consent_at=AGORA
    )

    assert "Dra. Camila Fernandes" in resultado.meal_plan.source_text
    assert "Página 1 de 2" in resultado.meal_plan.source_text


@pytest.mark.db
def test_posicoes_sao_sequenciais_mesmo_com_linhas_descartadas(db_session, usuario):
    resultado = import_plan_from_pdf(
        db_session, usuario, build_pdf(PLANO_REALISTA), consent_at=AGORA
    )

    assert [item.position for item in resultado.meal_plan.items] == [1, 2, 3, 4, 5]


# --------------------------------------------------------------------------
# casamento no import: sugere, não confirma
# --------------------------------------------------------------------------

@pytest.mark.db
def test_item_reconhecido_no_catalogo_fica_pendente(db_session, usuario):
    pdf = build_pdf(["1,2 kg de peito de frango sem pele"])

    resultado = import_plan_from_pdf(db_session, usuario, pdf, consent_at=AGORA)
    item = resultado.meal_plan.items[0]

    assert item.status is PlanItemStatus.PENDENTE
    assert resultado.items_matched == 1


@pytest.mark.db
def test_o_import_nunca_confirma_sozinho(db_session, usuario):
    # Mesmo com o nome exato do produto, quem escolhe é o usuário.
    pdf = build_pdf(["1,2 kg de peito de frango sem pele"])

    resultado = import_plan_from_pdf(db_session, usuario, pdf, consent_at=AGORA)
    item = resultado.meal_plan.items[0]

    assert item.product_id is None
    assert item.status is not PlanItemStatus.CONFIRMADO


@pytest.mark.db
def test_item_fora_do_catalogo_fica_nao_identificado(db_session, usuario):
    pdf = build_pdf(["1 dose de suplemento hipercalórico xyz"])

    resultado = import_plan_from_pdf(db_session, usuario, pdf, consent_at=AGORA)

    assert resultado.meal_plan.items[0].status is PlanItemStatus.NAO_IDENTIFICADO
    assert resultado.items_unidentified == 1


# --------------------------------------------------------------------------
# consentimento e persistência
# --------------------------------------------------------------------------

@pytest.mark.db
def test_grava_consentimento_com_data_e_versao(db_session, usuario):
    resultado = import_plan_from_pdf(
        db_session, usuario, build_pdf(PLANO_REALISTA), consent_at=AGORA
    )

    assert resultado.meal_plan.consent_at == AGORA
    # A versão vem da configuração, não de quem chamou.
    assert resultado.meal_plan.consent_version == "v1"


@pytest.mark.db
def test_nao_da_para_importar_sem_informar_o_consentimento(db_session, usuario):
    with pytest.raises(TypeError):
        import_plan_from_pdf(db_session, usuario, build_pdf(PLANO_REALISTA))


@pytest.mark.db
def test_o_plano_fica_gravado_no_usuario(db_session, usuario):
    import_plan_from_pdf(
        db_session,
        usuario,
        build_pdf(PLANO_REALISTA),
        consent_at=AGORA,
        title="Plano de outubro",
        nutritionist_name="Dra. Camila Fernandes",
    )
    db_session.commit()

    plano = db_session.scalars(select(MealPlan).where(MealPlan.user_id == usuario.id)).one()
    assert plano.title == "Plano de outubro"
    assert plano.nutritionist_name == "Dra. Camila Fernandes"
    assert db_session.scalars(select(PlanItem).where(PlanItem.meal_plan_id == plano.id)).all()


@pytest.mark.db
def test_pdf_digitalizado_nao_grava_plano_nenhum(db_session, usuario):
    with pytest.raises(PdfWithoutTextError):
        import_plan_from_pdf(db_session, usuario, build_pdf([]), consent_at=AGORA)

    db_session.rollback()
    assert db_session.scalars(select(MealPlan)).all() == []
