"""Testes do import do plano alimentar a partir do PDF.

O filtro de ruído é testado sem banco. O import completo usa Postgres, porque
depende do catálogo para saber o que conseguiu identificar.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.models import MealPlan, PlanItem
from app.models.enums import PlanItemStatus
from app.services.import_plan import _discard_reason, _discard_reasons, import_plan_from_pdf
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


@pytest.mark.parametrize("linha", ["09:00 - Lanche", "21h00 - Antes de dormir", "15:30 - Lanche:"])
def test_horario_com_nome_e_cabecalho_de_refeicao(linha):
    assert _discard_reason(linha) == "cabeçalho de refeição"


# --------------------------------------------------------------------------
# filtro com contexto: PDF do Dietbox
# --------------------------------------------------------------------------

# Recorte de um plano exportado pelo Dietbox, com as linhas como o pypdf as
# entrega. Nomes, cidade e contatos são fictícios.
PLANO_DIETBOX = [
    "Fernanda Lima",
    "fernanda.nutri@example.com",
    "CRN: 99999",
    "Goiânia",
    "Plano Alimentar",
    "JOÃO DA SILVA",
    "11/02/2026",
    "Todos os dias",
    "Plano alimentar para JOÃO DA SILVA",
    "08:30 - Café da manhã",
    "Pão francês - 1 unidade média de 50g",
    "Ovo de galinha - 2 Unidades",
    "Substituição para 1 pão francês: 2 fatias de pão de forma integral OU 7 colheres de "
    "sopa de cuscuz cozido 126g OU 2",
    "colheres de sopa cheia de tapioca 35g OU 160g de batata doce.",
    "Substituição 1",
    "Ovo - 1 unidade",
    "Tapioca - 2 colheres de sopa - 35g",
    "09:00 - Lanche",
    "Fruta - 1 das porções abaixo",
    "12:30 - Almoço",
    "Arroz branco cozido - 6 colheres de sopa cheia - 150g",
    "Feijão cozido - 1 concha pequena - 50g",
]


def _itens(linhas):
    motivos = _discard_reasons(linhas)
    return [linha for linha, motivo in zip(linhas, motivos, strict=True) if motivo is None]


def test_dietbox_so_os_itens_das_refeicoes_viram_item():
    assert _itens(PLANO_DIETBOX) == [
        "Pão francês - 1 unidade média de 50g",
        "Ovo de galinha - 2 Unidades",
        "Fruta - 1 das porções abaixo",
        "Arroz branco cozido - 6 colheres de sopa cheia - 150g",
        "Feijão cozido - 1 concha pequena - 50g",
    ]


def test_cabecalho_antes_da_primeira_refeicao_e_descartado():
    motivos = dict(zip(PLANO_DIETBOX, _discard_reasons(PLANO_DIETBOX), strict=True))

    assert motivos["Fernanda Lima"] == "cabeçalho do documento"
    assert motivos["Goiânia"] == "cabeçalho do documento"
    assert motivos["JOÃO DA SILVA"] == "cabeçalho do documento"
    assert motivos["Todos os dias"] == "cabeçalho do documento"
    # O motivo específico continua valendo dentro do cabeçalho.
    assert motivos["CRN: 99999"] == "identificação do profissional"


def test_bloco_de_substituicao_vai_ate_a_proxima_refeicao():
    motivos = dict(zip(PLANO_DIETBOX, _discard_reasons(PLANO_DIETBOX), strict=True))

    assert motivos["Substituição 1"] == "opção de substituição"
    assert motivos["Ovo - 1 unidade"] == "opção de substituição"
    assert motivos["Tapioca - 2 colheres de sopa - 35g"] == "opção de substituição"
    assert motivos["Fruta - 1 das porções abaixo"] is None


def test_paragrafo_quebrado_e_descartado_inteiro():
    motivos = dict(zip(PLANO_DIETBOX, _discard_reasons(PLANO_DIETBOX), strict=True))

    # A última linha do parágrafo é curta, mas continua a anterior.
    assert motivos["colheres de sopa cheia de tapioca 35g OU 160g de batata doce."] == (
        "texto de orientação"
    )


def test_sem_refeicoes_nada_e_tratado_como_cabecalho():
    # Lista de compras solta, sem horários: a primeira linha é comida.
    linhas = ["Peito de frango - 1,2 kg", "Arroz integral - 1 kg"]

    assert _itens(linhas) == linhas


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


@pytest.mark.db
def test_importa_o_plano_do_dietbox_com_as_quantidades_de_compra(db_session, usuario):
    resultado = import_plan_from_pdf(
        db_session, usuario, build_pdf(PLANO_DIETBOX), consent_at=AGORA
    )

    itens = [
        (item.raw_description, item.quantity, item.unit.value)
        for item in resultado.meal_plan.items
    ]
    assert itens == [
        ("Pão francês - 1 unidade média de 50g", 50, "g"),
        ("Ovo de galinha - 2 Unidades", 2, "unidade"),
        ("Fruta - 1 das porções abaixo", 1, "unidade"),
        ("Arroz branco cozido - 6 colheres de sopa cheia - 150g", 150, "g"),
        ("Feijão cozido - 1 concha pequena - 50g", 50, "g"),
    ]
    # A medida não entra na descrição que vai para o casamento.
    assert all("-" not in item.normalized_description for item in resultado.meal_plan.items)
    assert len(resultado.discarded) + resultado.items_created == len(PLANO_DIETBOX)


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
        nutritionist_crn="CRN-3 48291",
    )
    db_session.commit()

    plano = db_session.scalars(select(MealPlan).where(MealPlan.user_id == usuario.id)).one()
    assert plano.title == "Plano de outubro"
    assert plano.nutritionist_name == "Dra. Camila Fernandes"
    assert plano.nutritionist_crn == "CRN-3 48291"
    assert db_session.scalars(select(PlanItem).where(PlanItem.meal_plan_id == plano.id)).all()


@pytest.mark.db
def test_nutricionista_e_crn_sao_opcionais(db_session, usuario):
    """Sem nome e sem CRN o plano continua válido.

    Exigir o registro profissional impediria de importar uma prescrição que a
    pessoa tem em mãos — a prescrição é que importa, não o cadastro de quem a
    assinou.
    """
    resultado = import_plan_from_pdf(
        db_session, usuario, build_pdf(PLANO_REALISTA), consent_at=AGORA
    )
    db_session.commit()

    assert resultado.meal_plan.nutritionist_name is None
    assert resultado.meal_plan.nutritionist_crn is None
    assert resultado.items_created > 0


@pytest.mark.db
def test_pdf_digitalizado_nao_grava_plano_nenhum(db_session, usuario):
    with pytest.raises(PdfWithoutTextError):
        import_plan_from_pdf(db_session, usuario, build_pdf([]), consent_at=AGORA)

    db_session.rollback()
    assert db_session.scalars(select(MealPlan)).all() == []
