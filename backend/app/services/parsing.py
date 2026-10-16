"""Leitura de uma linha do plano alimentar.

Dois formatos são aceitos:
  - quantidade, unidade e descrição, nessa ordem: "1,2 kg de peito de frango",
    "1 dúzia de ovos", "banana prata";
  - descrição e medidas separadas por travessão, como sai do Dietbox:
    "Arroz branco cozido - 6 colheres de sopa cheia - 150g".

Separar a quantidade antes de comparar com o catálogo não é detalhe: sem isso,
o "1 2 kg" entra na comparação textual e derruba o score do produto certo.
"""

import re
from dataclasses import dataclass
from decimal import Decimal

from app.models.enums import MeasurementUnit
from app.services.text import strip_accents

_UNIT_ALIASES: dict[str, MeasurementUnit] = {
    "g": MeasurementUnit.GRAMA,
    "gr": MeasurementUnit.GRAMA,
    "grama": MeasurementUnit.GRAMA,
    "gramas": MeasurementUnit.GRAMA,
    "kg": MeasurementUnit.QUILOGRAMA,
    "kgs": MeasurementUnit.QUILOGRAMA,
    "quilo": MeasurementUnit.QUILOGRAMA,
    "quilos": MeasurementUnit.QUILOGRAMA,
    "quilograma": MeasurementUnit.QUILOGRAMA,
    "quilogramas": MeasurementUnit.QUILOGRAMA,
    "ml": MeasurementUnit.MILILITRO,
    "mililitro": MeasurementUnit.MILILITRO,
    "mililitros": MeasurementUnit.MILILITRO,
    "l": MeasurementUnit.LITRO,
    "lt": MeasurementUnit.LITRO,
    "litro": MeasurementUnit.LITRO,
    "litros": MeasurementUnit.LITRO,
    "un": MeasurementUnit.UNIDADE,
    "und": MeasurementUnit.UNIDADE,
    "unid": MeasurementUnit.UNIDADE,
    "unidade": MeasurementUnit.UNIDADE,
    "unidades": MeasurementUnit.UNIDADE,
}

# "dúzia" não é unidade de medida: é um multiplicador de unidades.
_MULTIPLIERS: dict[str, Decimal] = {
    "duzia": Decimal("12"),
    "duzias": Decimal("12"),
}

_LINE = re.compile(
    r"^(?P<quantity>\d+(?:[.,]\d+)?)?\s*(?P<word>[^\W\d_]+)?\s*(?P<rest>.*)$",
    re.UNICODE,
)

_LEADING_DE = re.compile(r"^de\s+", re.IGNORECASE)

# Hífen ou travessão com espaço dos dois lados. Sem o espaço, é palavra
# composta ("castanha-do-pará") e não separador.
_DASH_SEPARATOR = re.compile(r"\s+[-–—]\s+")
_STARTS_WITH_NUMBER = re.compile(r"^\d")
# Número seguido de palavra, com ou sem espaço: "150g", "2 Unidades".
_MEASURE = re.compile(r"(?P<quantity>\d+(?:[.,]\d+)?)\s*(?P<word>[^\W\d_]+)", re.UNICODE)

# Massa e volume vêm antes da contagem: é nessas grandezas que o supermercado
# vende pão, arroz e queijo, e "1 unidade média de 50g" comprada como 50 g casa
# com o produto vendido por quilo.
_METRIC_UNITS = frozenset(
    {
        MeasurementUnit.GRAMA,
        MeasurementUnit.QUILOGRAMA,
        MeasurementUnit.MILILITRO,
        MeasurementUnit.LITRO,
    }
)


@dataclass(frozen=True)
class ParsedItem:
    """Uma linha do plano já separada em suas partes."""

    quantity: Decimal
    unit: MeasurementUnit
    description: str
    # Linha exatamente como veio do plano, preservada para o banco.
    raw: str


def _parse_measures(measures: str) -> tuple[Decimal, MeasurementUnit]:
    """A quantidade de compra dentro das medidas de uma linha do Dietbox.

    Medida caseira ("6 colheres de sopa", "1 concha") não é unidade de compra e
    é ignorada. Entre as medidas que são, ganha a primeira de massa ou volume;
    sem nenhuma, a primeira contagem; sem nada, 1 unidade, como no outro formato.
    """
    found: list[tuple[Decimal, MeasurementUnit]] = []
    for match in _MEASURE.finditer(measures):
        quantity = Decimal(match["quantity"].replace(",", "."))
        key = strip_accents(match["word"].lower())
        if key in _MULTIPLIERS:
            found.append((quantity * _MULTIPLIERS[key], MeasurementUnit.UNIDADE))
        elif key in _UNIT_ALIASES:
            found.append((quantity, _UNIT_ALIASES[key]))

    for quantity, unit in found:
        if unit in _METRIC_UNITS:
            return quantity, unit
    if found:
        return found[0]
    return Decimal("1"), MeasurementUnit.UNIDADE


def parse_item_line(line: str) -> ParsedItem:
    """Separa quantidade, unidade e descrição de uma linha do plano.

    Sem quantidade explícita, assume 1 unidade: "banana prata" é um item válido.
    Palavra desconhecida logo após o número (como "pote") não é unidade e
    continua fazendo parte da descrição.
    """
    text = line.strip()
    if not text:
        raise ValueError("linha vazia do plano alimentar")

    # Formato do Dietbox: descrição antes, medidas depois do travessão. Linha
    # que começa com número é do outro formato, mesmo que tenha travessão.
    parts = _DASH_SEPARATOR.split(text, maxsplit=1)
    if len(parts) == 2 and not _STARTS_WITH_NUMBER.match(text) and parts[0].strip():
        quantity, unit = _parse_measures(parts[1])
        return ParsedItem(quantity=quantity, unit=unit, description=parts[0].strip(), raw=line)

    match = _LINE.match(text)
    if match is None:  # pragma: no cover - o padrão aceita qualquer texto não vazio
        raise ValueError(f"não foi possível ler a linha: {line!r}")

    quantity = Decimal((match["quantity"] or "1").replace(",", "."))
    word = match["word"] or ""
    rest = match["rest"].strip()
    key = strip_accents(word.lower())

    if key in _MULTIPLIERS:
        quantity *= _MULTIPLIERS[key]
        unit = MeasurementUnit.UNIDADE
        description = _LEADING_DE.sub("", rest)
    elif key in _UNIT_ALIASES:
        unit = _UNIT_ALIASES[key]
        description = _LEADING_DE.sub("", rest)
    else:
        # A palavra não era unidade: devolve ela para a descrição.
        unit = MeasurementUnit.UNIDADE
        description = f"{word} {rest}".strip()

    if not description:
        raise ValueError(f"linha sem descrição de item: {line!r}")

    return ParsedItem(quantity=quantity, unit=unit, description=description, raw=line)
