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

Algumas linhas só se reconhecem pelo contexto, e é `_discard_reasons` quem olha
o documento inteiro:
  - o cabeçalho antes da primeira refeição (nome da nutricionista, cidade, nome
    do paciente) não é comida, desde que o PDF tenha refeições;
  - o bloco "Substituição 1" do Dietbox é alternativa a uma refeição, não item a
    mais: entraria na lista de compras somado ao prato principal (decisão 8);
  - parágrafo de orientação que o PDF quebrou em várias linhas;
  - o bloco "Orientação:" vai até a próxima substituição ou refeição. É como o
    plano montado no app escreve a observação da refeição, e a continuação
    curta de uma orientação quebrada na margem viraria item. O "Observações:"
    do Dietbox é o mesmo bloco: dicas, sugestões de preparo e receitas;

E algumas só se reconhecem pela posição na página, e é `_read_pages` quem olha:
  - a tabela "Opção principal / Opção de substituição" do Dietbox põe as duas
    opções lado a lado. Lida como texto corrido, a linha juntava o prato
    principal e a substituição num item só, e a substituição que vinha sozinha
    na coluna da direita entrava na compra (decisões 8 e 12);
  - o nome da nutricionista e o "Acesse o app" que o PDF repete no topo e no pé
    de toda página não são comida.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import MealPlan, PlanItem, Product, User
from app.models.enums import MeasurementUnit, PlanItemStatus
from app.services.matching import MINIMUM_SCORE, find_candidates
from app.services.parsing import parse_item_line
from app.services.pdf import collapse_spaces, extract_pages
from app.services.text import normalize_text, strip_accents

# Acima disto a linha é parágrafo de orientação, não item de compra.
MAXIMUM_ITEM_LENGTH = 120

# Linha deste tamanho em diante é um parágrafo que o PDF quebrou na margem. A
# linha seguinte é a continuação dele, mesmo que curta: "necessários.".
WRAPPED_LINE_LENGTH = 90

_MEAL_HEADERS = frozenset(
    {
        "cafe da manha",
        "colacao",
        "lanche",
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

# "Página 1 de 2", e também o rodapé do Dietbox: "Página 1/6 | Paciente ...".
_PAGE_NUMBER = re.compile(r"^(p[áa]gina\s*)?\d+\s*(de|/)\s*\d+(\s*\|.*)?$", re.IGNORECASE)
_DATE = re.compile(r"^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$")
_ONLY_SYMBOLS = re.compile(r"^[\d\s.,:;/_\-–—=*|]+$")
_CONTACT = re.compile(r"@|www\.|https?://|\bcrn\b|\bcpf\b|\(\d{2}\)\s*\d", re.IGNORECASE)
# Tratamento profissional no começo da linha. Nenhum alimento começa com "Dra.".
_PROFESSIONAL = re.compile(r"^(dr|dra|nutri|nutricionista)\b\.?", re.IGNORECASE)
_DOCUMENT_TITLE = re.compile(r"plano\s+alimentar|prescri[çc][ãa]o\s+nutricional", re.IGNORECASE)
_HAS_LETTER = re.compile(r"[a-zA-ZÀ-ÿ]")
# Hora solta ou prefixando a linha: "07:30", "16h30".
_TIME_PREFIX = re.compile(r"^\d{1,2}\s*[:h]\s*\d{0,2}\s*[-–—]?\s*", re.IGNORECASE)
# Horário seguido de um nome curto: "09:00 - Lanche", "21h00 - Antes de dormir".
# Item alimentar não começa com horário, então o nome não precisa ser conhecido.
_TIMED_HEADER = re.compile(r"^\d{1,2}\s*[:h]\s*\d{2}\s*[-–—]\s*[^\W\d_].{0,40}$", re.IGNORECASE)
_SUBSTITUTION_HEADER = re.compile(r"^substitui[çc][ãa]o(\s+\d+)?\s*:?$", re.IGNORECASE)
# Começo de um bloco de orientação: "Orientação: evite fritura". É como o plano
# montado no app escreve as observações da refeição no PDF; o Dietbox escreve
# "Observações:".
_ORIENTATION_START = re.compile(
    r"^(orienta[çc][ãa]o|observa[çc](?:[ãa]o|[õo]es))\s*:", re.IGNORECASE
)
# Cabeçalho da tabela do Dietbox. O grupo marca onde começa a coluna da direita.
_COLUMNS_HEADER = re.compile(
    r"op[çc][ãa]o\s+principal\s+(op[çc][ãa]o\s+de\s+substitui[çc][ãa]o)", re.IGNORECASE
)
# Três espaços ou mais separam uma coluna da outra no modo layout.
_COLUMN_GAP = re.compile(r"\s{3,}")
# Quantidade solta entre parênteses: a célula quebrou e "(165g)" desceu sozinho.
_AMOUNT_ONLY = re.compile(r"^\(\s*\d+(?:[.,]\d+)?\s*(?:g|kg|mg|ml|l)\s*\)$", re.IGNORECASE)

# Quantas linhas do topo e do pé de cada página podem ser cabeçalho ou rodapé.
PAGE_TOP_LINES = 4
PAGE_BOTTOM_LINES = 2

_MEAL_HEADER_REASON = "cabeçalho de refeição"
_SECTION_HEADER_REASON = "cabeçalho de seção"
_SUBSTITUTION_REASON = "opção de substituição"
_PAGE_EDGE_REASON = "cabeçalho ou rodapé de página"
_COLUMNS_HEADER_REASON = "cabeçalho da tabela de opções"


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
    if nucleo in _MEAL_HEADERS or _TIMED_HEADER.match(line):
        return _MEAL_HEADER_REASON

    if line.rstrip().endswith(":"):
        return _SECTION_HEADER_REASON

    return None


def _edge_zone(lines: list[str]) -> set[int]:
    """Posições da página onde cabe cabeçalho ou rodapé.

    O topo são as primeiras `PAGE_TOP_LINES` linhas, mas para na primeira
    refeição: o que vem depois dela já é o plano. O pé são as últimas
    `PAGE_BOTTOM_LINES`.
    """
    zone: set[int] = set()
    for index, line in enumerate(lines[:PAGE_TOP_LINES]):
        if _discard_reason(line) == _MEAL_HEADER_REASON:
            break
        zone.add(index)
    zone.update(range(max(0, len(lines) - PAGE_BOTTOM_LINES), len(lines)))
    return zone


def _page_edges(pages: list[list[str]]) -> set[str]:
    """Linhas que o PDF repete no topo ou no pé das páginas.

    Vale só o que aparece na zona de borda (`_edge_zone`) de todas as páginas,
    ou de todas menos uma a partir de quatro — a capa costuma ser diferente.
    Com duas ou três páginas, "menos uma" seria metade delas. O nome da
    nutricionista e o "Acesse o app" estão em todas; alimento repetido igual,
    com a mesma medida, na borda de quase toda página não acontece.
    """
    if len(pages) < 2:
        return set()

    pages_with: dict[str, int] = {}
    for page in pages:
        lines = [collapse_spaces(line) for line in page]
        for line in {lines[index] for index in _edge_zone(lines)}:
            pages_with[line] = pages_with.get(line, 0) + 1

    minimum = len(pages) if len(pages) <= 3 else len(pages) - 1
    return {line for line, count in pages_with.items() if count >= minimum}


def _columns(raw: str, split_at: int) -> tuple[str, str]:
    """O texto da coluna da esquerda e o da direita de uma linha da tabela."""
    left: list[str] = []
    right: list[str] = []
    start = 0
    for gap in [*_COLUMN_GAP.finditer(raw), None]:
        end = gap.start() if gap else len(raw)
        segment = raw[start:end]
        if segment.strip():
            # O começo do trecho, e não o fim, diz a coluna: o texto da esquerda
            # pode passar do meio da página.
            offset = start + len(segment) - len(segment.lstrip())
            (right if offset >= split_at else left).append(segment.strip())
        if gap:
            start = gap.end()
    return collapse_spaces(" ".join(left)), collapse_spaces(" ".join(right))


def _read_pages(pages: list[list[str]]) -> tuple[list[str], list[str | None]]:
    """As linhas do documento e o motivo que a posição na página já dá a elas.

    Devolve duas listas do mesmo tamanho: o texto, sem espaço sobrando, e o
    motivo de descarte que só a posição revela (None quando ela não diz nada).
    A linha da tabela de opções vira duas: a opção principal, que segue para o
    filtro, e a substituição, já descartada — e as duas ficam no relatório.
    """
    edges = _page_edges(pages)
    lines: list[str] = []
    presets: list[str | None] = []

    # Onde começa a coluna da direita, enquanto se está dentro da tabela.
    split_at: int | None = None
    # Última linha de cada coluna, para juntar a quantidade que desceu sozinha.
    last: dict[str | None, int] = {}

    def add(text: str, preset: str | None) -> None:
        if _AMOUNT_ONLY.match(text) and preset in last:
            lines[last[preset]] += f" {text}"
            return
        last[preset] = len(lines)
        lines.append(text)
        presets.append(preset)

    for page in pages:
        zone = _edge_zone([collapse_spaces(raw) for raw in page])
        for index, raw in enumerate(page):
            text = collapse_spaces(raw)
            if index in zone and text in edges:
                lines.append(text)
                presets.append(_PAGE_EDGE_REASON)
                continue

            header = _COLUMNS_HEADER.search(raw)
            if header:
                # O meio do caminho entre os dois títulos: a célula da direita
                # começa uns caracteres antes do título dela.
                split_at = (header.start() + header.start(1)) // 2
                last = {}
                lines.append(text)
                presets.append(_COLUMNS_HEADER_REASON)
                continue

            if split_at is not None and _discard_reason(text) in (
                _MEAL_HEADER_REASON,
                _SECTION_HEADER_REASON,
            ):
                # "Observações:" ou a próxima refeição: a tabela acabou.
                split_at = None

            if split_at is None:
                lines.append(text)
                presets.append(None)
                continue

            left, right = _columns(raw, split_at)
            if left:
                add(left, None)
            if right:
                add(right, _SUBSTITUTION_REASON)

    return lines, presets


def _discard_reasons(
    lines: list[str], presets: Sequence[str | None] | None = None
) -> list[str | None]:
    """O motivo de descarte de cada linha, olhando também as vizinhas.

    Devolve uma lista do mesmo tamanho de `lines`; None é item. O motivo que a
    posição na página deu (`presets`, de `_read_pages`) vale primeiro; depois o
    da linha isolada (`_discard_reason`), por ser o mais específico.
    """
    if presets is None:
        presets = [None] * len(lines)
    own = [_discard_reason(line) for line in lines]
    has_meals = _MEAL_HEADER_REASON in own

    reasons: list[str | None] = []
    before_first_meal = has_meals
    in_substitution = False
    in_orientation = False
    previous_wrapped = False

    for line, reason, preset in zip(lines, own, presets, strict=True):
        if preset is not None:
            # Rodapé e substituição da tabela não mexem no contexto: o rodapé
            # cai no meio do bloco, e a substituição é da mesma refeição.
            reasons.append(preset)
            continue

        if reason == _MEAL_HEADER_REASON:
            before_first_meal = False
            in_substitution = False
            in_orientation = False
        if _ORIENTATION_START.match(line):
            # Marcado antes do motivo próprio: a primeira linha pode já chegar
            # descartada por ser longa, e o bloco tem de começar mesmo assim.
            in_orientation = True

        wrapped = previous_wrapped
        previous_wrapped = len(line) >= WRAPPED_LINE_LENGTH

        if reason is None:
            if before_first_meal:
                reason = "cabeçalho do documento"
            elif _SUBSTITUTION_HEADER.match(line):
                in_substitution = True
                in_orientation = False
                reason = _SUBSTITUTION_REASON
            elif in_orientation:
                reason = "texto de orientação"
            elif in_substitution:
                reason = _SUBSTITUTION_REASON
            elif len(line) >= WRAPPED_LINE_LENGTH or wrapped:
                reason = "texto de orientação"

        reasons.append(reason)

    return reasons


def add_plan_item(
    plan: MealPlan,
    catalog: Sequence[Product],
    *,
    raw: str,
    description: str,
    quantity: Decimal,
    unit: MeasurementUnit,
) -> bool:
    """Acrescenta o item ao plano já com o casamento sugerido.

    Devolve se algum candidato passou do score mínimo. Sugerido, nunca
    confirmado: `product_id` continua nulo, e quem escolhe é o usuário. É o
    mesmo caminho para o item lido do PDF e para o item do plano que a
    nutricionista montou no app.
    """
    candidates = find_candidates(description, quantity, unit, catalog)
    identified = bool(candidates) and candidates[0].score >= MINIMUM_SCORE

    plan.items.append(
        PlanItem(
            position=len(plan.items) + 1,
            raw_description=raw,
            normalized_description=normalize_text(description),
            quantity=quantity,
            unit=unit,
            status=PlanItemStatus.PENDENTE if identified else PlanItemStatus.NAO_IDENTIFICADO,
        )
    )
    return identified


def import_plan_from_pdf(
    session: Session,
    user: User,
    pdf_bytes: bytes,
    *,
    consent_at: datetime,
    title: str | None = None,
    nutritionist_name: str | None = None,
    nutritionist_crn: str | None = None,
) -> ImportedPlan:
    """Lê o PDF e grava o plano alimentar do usuário.

    `consent_at` é obrigatório e não tem padrão de propósito: é o momento em que
    a pessoa aceitou o termo. A versão do termo vem da configuração, para que o
    texto exibido e o texto registrado não possam divergir.

    Não confirma a transação: quem chama decide quando fazer commit.

    Levanta `PdfWithoutTextError` se o arquivo for digitalizado e `InvalidPdfError`
    se não for um PDF legível.
    """
    lines, presets = _read_pages(extract_pages(pdf_bytes))

    plan = MealPlan(
        user=user,
        title=title,
        # O PDF inteiro, como veio: é o que permite conferir depois o que o
        # filtro descartou e o que o parser entendeu errado.
        source_text="\n".join(lines),
        nutritionist_name=nutritionist_name,
        nutritionist_crn=nutritionist_crn,
        consent_at=consent_at,
        consent_version=get_settings().consent_version,
    )
    session.add(plan)

    catalog = session.scalars(select(Product)).all()

    discarded: list[DiscardedLine] = []
    matched = 0
    unidentified = 0

    for line, reason in zip(lines, _discard_reasons(lines, presets), strict=True):
        if reason is not None:
            discarded.append(DiscardedLine(text=line, reason=reason))
            continue

        try:
            parsed = parse_item_line(line)
        except ValueError:
            discarded.append(DiscardedLine(text=line, reason="não foi possível ler a linha"))
            continue

        identified = add_plan_item(
            plan,
            catalog,
            raw=parsed.raw,
            description=parsed.description,
            quantity=parsed.quantity,
            unit=parsed.unit,
        )
        if identified:
            matched += 1
        else:
            unidentified += 1

    session.flush()

    return ImportedPlan(
        meal_plan=plan,
        items_created=len(plan.items),
        items_matched=matched,
        items_unidentified=unidentified,
        discarded=discarded,
    )
