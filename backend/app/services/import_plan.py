"""Import do plano alimentar a partir do PDF da nutricionista.

O caminho é: extrair o texto, separar o que é item alimentar do que é cabeçalho,
criar os itens do plano e sugerir produtos do catálogo para cada um.

Regras que este módulo faz valer:
  - sem consentimento explícito não existe plano gravado (LGPD, decisão 5);
  - o texto integral do PDF fica guardado para auditoria;
  - linha que não é item alimentar é descartada, mas devolvida no relatório —
    nada some em silêncio;
  - o casamento roda no import, porém nunca confirma nada: o item nasce
    `pendente` ou `nao_identificado`, e `product_id` continua nulo até o usuário
    escolher.

Sobre o filtro de ruído: `parsing.parse_item_line` aceita quase qualquer texto —
"Café da Manhã" viraria um item de 1 unidade. Quem separa item de cabeçalho é o
conjunto de padrões abaixo, deliberadamente conservador. Na dúvida a linha vira
item e o casamento a marca como não identificada, que é um estado visível; o
contrário jogaria comida fora do plano de alguém.
"""

import re
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import MealPlan, PlanItem, Product, User
from app.models.enums import PlanItemStatus
from app.services.matching import MINIMUM_SCORE, find_candidates
from app.services.parsing import parse_item_line
from app.services.pdf import extract_lines
from app.services.text import normalize_text, strip_accents

# Acima disto a linha é parágrafo de orientação, não item de compra.
MAXIMUM_ITEM_LENGTH = 120

_MEAL_HEADERS = frozenset(
    {
        "cafe da manha",
        "colacao",
        "lanche da manha",
        "almoco",
        "lanche da tarde",
        "cafe da tarde",
        "jantar",
        "ceia",
        "pre treino",
        "pos treino",
        "pre-treino",
        "pos-treino",
    }
)

_PAGE_NUMBER = re.compile(r"^(p[áa]gina\s*)?\d+\s*(de|/)\s*\d+$", re.IGNORECASE)
_DATE = re.compile(r"^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$")
_ONLY_SYMBOLS = re.compile(r"^[\d\s.,:;/_\-–—=*|]+$")
_CONTACT = re.compile(r"@|www\.|https?://|\bcrn\b|\bcpf\b|\(\d{2}\)\s*\d", re.IGNORECASE)
# Tratamento profissional no começo da linha. Nenhum alimento começa com "Dra.".
_PROFESSIONAL = re.compile(r"^(dr|dra|nutri|nutricionista)\b\.?", re.IGNORECASE)
_DOCUMENT_TITLE = re.compile(r"plano\s+alimentar|prescri[çc][ãa]o\s+nutricional", re.IGNORECASE)
_HAS_LETTER = re.compile(r"[a-zA-ZÀ-ÿ]")
# Hora solta ou prefixando a linha: "07:30", "16h30".
_TIME_PREFIX = re.compile(r"^\d{1,2}\s*[:h]\s*\d{0,2}\s*[-–—]?\s*", re.IGNORECASE)


@dataclass(frozen=True)
class DiscardedLine:
    """Linha do PDF que não virou item, com o motivo."""

    text: str
    reason: str


@dataclass(frozen=True)
class ImportedPlan:
    """O plano gravado e o resumo do que o PDF rendeu."""

    meal_plan: MealPlan
    items_created: int
    # Itens com algum candidato acima do score mínimo: status pendente.
    items_matched: int
    # Itens sem candidato plausível: status nao_identificado.
    items_unidentified: int
    discarded: list[DiscardedLine]


def _discard_reason(line: str) -> str | None:
    """Por que esta linha não é um item alimentar. None se ela for um item.

    A ordem importa: os padrões mais específicos vêm primeiro, senão "12/10/2025"
    seria classificado como linha sem texto em vez de data.
    """
    if _PAGE_NUMBER.match(line):
        return "número de página"

    if _DATE.match(line):
        return "data"

    if _CONTACT.search(line) or _PROFESSIONAL.match(line):
        return "identificação do profissional"

    if _DOCUMENT_TITLE.search(line):
        return "título do documento"

    if not _HAS_LETTER.search(line) or _ONLY_SYMBOLS.match(line):
        return "sem texto"

    if len(line) > MAXIMUM_ITEM_LENGTH:
        return "texto de orientação"

    # Cabeçalho de refeição, com ou sem horário e dois-pontos:
    # "Café da Manhã", "07:30 - Lanche da tarde:".
    sem_horario = _TIME_PREFIX.sub("", line)
    nucleo = strip_accents(sem_horario.strip().rstrip(":").strip().lower())
    if nucleo in _MEAL_HEADERS:
        return "cabeçalho de refeição"

    if line.rstrip().endswith(":"):
        return "cabeçalho de seção"

    return None


def import_plan_from_pdf(
    session: Session,
    user: User,
    pdf_bytes: bytes,
    *,
    consent_at: datetime,
    title: str | None = None,
    nutritionist_name: str | None = None,
) -> ImportedPlan:
    """Lê o PDF e grava o plano alimentar do usuário.

    `consent_at` é obrigatório e não tem padrão de propósito: é o momento em que
    a pessoa aceitou o termo. A versão do termo vem da configuração, para que o
    texto exibido e o texto registrado não possam divergir.

    Não confirma a transação: quem chama decide quando fazer commit.

    Levanta `PdfWithoutTextError` se o arquivo for digitalizado e `InvalidPdfError`
    se não for um PDF legível.
    """
    lines = extract_lines(pdf_bytes)

    plan = MealPlan(
        user=user,
        title=title,
        # O PDF inteiro, como veio: é o que permite conferir depois o que o
        # filtro descartou e o que o parser entendeu errado.
        source_text="\n".join(lines),
        nutritionist_name=nutritionist_name,
        consent_at=consent_at,
        consent_version=get_settings().consent_version,
    )
    session.add(plan)

    catalog = session.scalars(select(Product)).all()

    discarded: list[DiscardedLine] = []
    matched = 0
    unidentified = 0
    position = 0

    for line in lines:
        reason = _discard_reason(line)
        if reason is not None:
            discarded.append(DiscardedLine(text=line, reason=reason))
            continue

        try:
            parsed = parse_item_line(line)
        except ValueError:
            discarded.append(DiscardedLine(text=line, reason="não foi possível ler a linha"))
            continue

        candidates = find_candidates(parsed.description, parsed.quantity, parsed.unit, catalog)
        identified = bool(candidates) and candidates[0].score >= MINIMUM_SCORE

        if identified:
            matched += 1
        else:
            unidentified += 1

        position += 1
        plan.items.append(
            PlanItem(
                position=position,
                raw_description=parsed.raw,
                normalized_description=normalize_text(parsed.description),
                quantity=parsed.quantity,
                unit=parsed.unit,
                # Sugerido, nunca confirmado: product_id continua nulo, e quem
                # escolhe entre os candidatos é o usuário.
                status=PlanItemStatus.PENDENTE if identified else PlanItemStatus.NAO_IDENTIFICADO,
            )
        )

    session.flush()

    return ImportedPlan(
        meal_plan=plan,
        items_created=position,
        items_matched=matched,
        items_unidentified=unidentified,
        discarded=discarded,
    )
