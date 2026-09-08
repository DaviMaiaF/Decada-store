"""Casamento entre um item do plano alimentar e os produtos do catálogo.

O serviço nunca escolhe sozinho: devolve sempre uma lista de candidatos com
score, e a confirmação é do usuário. Também é aqui que a quantidade prescrita
é convertida para a unidade base do produto.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import ROUND_CEILING, Decimal

from rapidfuzz import fuzz
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PlanItem, Product
from app.models.enums import MeasurementUnit, PlanItemStatus
from app.services.parsing import parse_item_line
from app.services.text import normalize_text
from app.services.units import IncompatibleUnitError, to_base_quantity

# Abaixo disto o item é dado como não identificado.
MINIMUM_SCORE = Decimal("0.6")

MAX_CANDIDATES = 5

# O score mistura dois comparadores porque cada um sozinho erra:
#   token_set_ratio  ignora palavras sobrando — é o que faz a marca no meio do
#                    texto não atrapalhar — mas dá 100 para qualquer nome que
#                    contenha os termos buscados, então "ovos" empata entre
#                    "Ovos de galinha" e "Ovos de codorna em conserva".
#   ratio            compara os textos inteiros e desempata a favor do nome
#                    mais próximo em tamanho, desfazendo esse empate.
_TOKEN_SET_WEIGHT = Decimal("0.6")
_RATIO_WEIGHT = Decimal("0.4")


@dataclass(frozen=True)
class ScoredProduct:
    """Um produto e o quanto o nome dele se parece com o texto buscado."""

    product: Product
    # De 0 a 1, com três casas.
    score: Decimal


@dataclass(frozen=True)
class MatchCandidate:
    """Um produto que pode atender ao item, com o quanto se parece e a conversão."""

    product: Product
    # De 0 a 1, com três casas.
    score: Decimal
    # False quando a unidade do plano é de outra grandeza que a do produto
    # (o plano pede grama, o produto é vendido em litro).
    unit_compatible: bool
    quantity_in_base: Decimal | None
    # Quantas embalagens fechadas cobrem a quantidade prescrita.
    packages_needed: int | None


@dataclass(frozen=True)
class MatchResult:
    description: str
    quantity: Decimal
    unit: MeasurementUnit
    candidates: list[MatchCandidate]
    status: PlanItemStatus


def _score(normalized_query: str, product: Product) -> Decimal:
    """Semelhança entre o texto do plano e um produto, de 0 a 1."""
    targets = [product.normalized_name]
    if product.brand:
        # A marca entra como alternativa, não como obrigação: quem escreve
        # "arroz Grão Fino integral" e quem escreve "arroz integral" acham o mesmo.
        targets.append(f"{product.normalized_name} {normalize_text(product.brand)}")

    best = max(
        _TOKEN_SET_WEIGHT * Decimal(str(fuzz.token_set_ratio(normalized_query, target)))
        + _RATIO_WEIGHT * Decimal(str(fuzz.ratio(normalized_query, target)))
        for target in targets
    )
    return (best / 100).quantize(Decimal("0.001"))


def _convert(
    quantity: Decimal, unit: MeasurementUnit, product: Product
) -> tuple[bool, Decimal | None, int | None]:
    """Converte a quantidade prescrita para a unidade base do produto."""
    try:
        quantity_in_base = to_base_quantity(quantity, unit, product.base_unit)
    except IncompatibleUnitError:
        return False, None, None

    packages_needed = None
    if product.package_size is not None and product.package_unit is not None:
        package_in_base = to_base_quantity(
            product.package_size, product.package_unit, product.base_unit
        )
        # Arredonda para cima: meia embalagem não se compra.
        packages_needed = int(
            (quantity_in_base / package_in_base).to_integral_value(rounding=ROUND_CEILING)
        )

    return True, quantity_in_base, packages_needed


def rank_products(
    description: str, catalog: Sequence[Product], limit: int = MAX_CANDIDATES
) -> list[ScoredProduct]:
    """Produtos mais parecidos com uma descrição, do mais parecido ao menos.

    Responde "que produto é este?" sem envolver quantidade — que é o que a
    despensa precisa, onde o item pode não ter quantidade nenhuma.

    Função pura: recebe o catálogo pronto e não conhece o banco.
    """
    normalized_query = normalize_text(description)

    ranked = [ScoredProduct(product, _score(normalized_query, product)) for product in catalog]
    # O nome desempata scores iguais, para a ordem não variar entre execuções.
    ranked.sort(key=lambda scored: (-scored.score, scored.product.name))
    return ranked[:limit]


def find_candidates(
    description: str,
    quantity: Decimal,
    unit: MeasurementUnit,
    catalog: Sequence[Product],
) -> list[MatchCandidate]:
    """Os melhores candidatos para uma descrição, já com a quantidade convertida.

    Função pura: recebe o catálogo pronto e não conhece o banco.
    """
    return [
        MatchCandidate(
            scored.product,
            scored.score,
            *_convert(quantity, unit, scored.product),
        )
        for scored in rank_products(description, catalog)
    ]


def _status(candidates: Sequence[MatchCandidate]) -> PlanItemStatus:
    if not candidates or candidates[0].score < MINIMUM_SCORE:
        return PlanItemStatus.NAO_IDENTIFICADO
    # Nunca CONFIRMADO: a confirmação é um ato do usuário.
    return PlanItemStatus.PENDENTE


def match_text(text: str, catalog: Sequence[Product]) -> MatchResult:
    """Lê uma linha do plano e devolve os candidatos para ela."""
    item = parse_item_line(text)
    candidates = find_candidates(item.description, item.quantity, item.unit, catalog)

    return MatchResult(
        description=item.description,
        quantity=item.quantity,
        unit=item.unit,
        candidates=candidates,
        status=_status(candidates),
    )


def match_plan_item(session: Session, plan_item: PlanItem) -> MatchResult:
    """Mesma coisa, para um item já gravado: a quantidade do banco é a que vale."""
    catalog = session.scalars(select(Product)).all()
    description = parse_item_line(plan_item.raw_description).description
    candidates = find_candidates(description, plan_item.quantity, plan_item.unit, catalog)

    return MatchResult(
        description=description,
        quantity=plan_item.quantity,
        unit=plan_item.unit,
        candidates=candidates,
        status=_status(candidates),
    )
