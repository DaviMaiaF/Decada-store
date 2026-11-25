"""Quanto do que a lista de compras pede já está em casa.

Regras que este módulo faz valer:
  - o abatimento é parcial: precisa de 1,2 kg e tem 0,5 kg em casa, compra 0,7 kg;
  - item da despensa sem quantidade abate o item inteiro: quem diz "tenho ovo"
    sem dizer quanto está dizendo que tem o bastante;
  - item cuja unidade é de outra grandeza que a do produto não abate: é dado
    errado, não um "tenho" (a entrada já recusa, ver `ensure_measurable`);
  - a soma é feita na unidade base do produto (kg, l ou unidade);
  - ter mais do que precisa zera a compra, nunca produz quantidade negativa.

O item sem quantidade abate tudo porque é o que a pessoa quis dizer ao marcar
"Tenho" ou confirmar o alimento da foto — e é a mesma leitura que as receitas já
fazem dele. Quem tem só um pouco diz quanto, e aí o abatimento é parcial.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PantryItem, Product
from app.models.enums import BaseUnit, MeasurementUnit
from app.services.matching import MAX_CANDIDATES, MINIMUM_SCORE, ScoredProduct, rank_products
from app.services.text import normalize_text
from app.services.units import IncompatibleUnitError, base_unit_of, to_base_quantity

# Mesma precisão das colunas de quantidade do banco, Numeric(12, 3).
_QUANTITY_PRECISION = Decimal("0.001")

_ZERO = Decimal("0.000")


@dataclass(frozen=True)
class PantryCoverage:
    """O quanto a despensa cobre de uma quantidade necessária.

    Todas as quantidades estão na unidade base do produto.
    """

    needed: Decimal
    # O que a despensa abate de fato. Com item sem quantidade, é tudo o que se
    # precisa — ver `has_unmeasured_stock`.
    available: Decimal
    # O que sobra para comprar. Nunca negativo.
    to_buy: Decimal
    fully_covered: bool
    # Há item deste produto na despensa fora da soma — sem quantidade, que cobre
    # o item inteiro, ou em unidade de outra grandeza, que não abate nada.
    has_unmeasured_items: bool
    base_unit: BaseUnit


def _quantize(quantity: Decimal) -> Decimal:
    return quantity.quantize(_QUANTITY_PRECISION, ROUND_HALF_UP)


def ensure_measurable(product: Product | None, unit: MeasurementUnit | None) -> None:
    """A unidade da medição tem de ser da grandeza em que o produto é vendido.

    Guardar "500 ml" de um produto vendido por quilo é aceito pelo banco e produz
    o pior item possível: ele aparece na despensa, a pessoa acha que descontou da
    compra, e `available_quantity` o conta como não medido porque a conversão não
    existe. Recusar na entrada é mais honesto que abater nada em silêncio.

    Item sem produto não tem grandeza com que comparar, e aí não há o que validar.
    """
    if product is None or unit is None:
        return

    if base_unit_of(unit) is not product.base_unit:
        raise IncompatibleUnitError(
            f"{product.name} é vendido em {product.base_unit.value};"
            f" {unit.value} não é da mesma grandeza"
        )


def available_quantity(
    pantry_items: Sequence[PantryItem], product: Product
) -> tuple[Decimal, bool]:
    """Quanto deste produto a despensa tem, na unidade base, e se algo ficou de fora.

    Função pura. Itens de outros produtos são ignorados.
    """
    total = _ZERO
    unmeasured = False

    for item in pantry_items:
        if item.product_id != product.id:
            continue

        if item.quantity is None or item.unit is None:
            unmeasured = True
            continue

        try:
            total += to_base_quantity(item.quantity, item.unit, product.base_unit)
        except IncompatibleUnitError:
            # Litro na despensa e produto vendido por quilo: somar seria inventar
            # uma conversão que não existe.
            unmeasured = True

    return _quantize(total), unmeasured


def has_unmeasured_stock(pantry_items: Sequence[PantryItem], product: Product) -> bool:
    """A despensa tem este produto sem medida: o "Tenho" do guia, o item da foto.

    Sem quantidade ou sem unidade, o item diz que há o bastante em casa, e abate
    o que se precisa por inteiro.
    """
    return any(
        item.product_id == product.id and (item.quantity is None or item.unit is None)
        for item in pantry_items
    )


def pantry_cover(
    pantry_items: Sequence[PantryItem], product: Product, needed: Decimal
) -> Decimal:
    """Quanto de `needed` (na unidade base) a despensa abate deste produto.

    Nunca mais do que se precisa: ter três quilos em casa não faz o item ter
    pedido três quilos. Item sem quantidade abate tudo.
    """
    if has_unmeasured_stock(pantry_items, product):
        return _quantize(needed)
    available, _ = available_quantity(pantry_items, product)
    return _quantize(min(available, needed))


def coverage(
    quantity: Decimal,
    unit: MeasurementUnit,
    product: Product,
    pantry_items: Sequence[PantryItem],
) -> PantryCoverage:
    """Cobertura da despensa para uma quantidade necessária de um produto.

    Levanta `IncompatibleUnitError` se a quantidade pedida não for da mesma
    grandeza do produto — pedir 500 ml de um produto vendido por quilo é erro
    de quem chamou, não zero de cobertura.
    """
    needed = _quantize(to_base_quantity(quantity, unit, product.base_unit))
    available, unmeasured = available_quantity(pantry_items, product)
    if has_unmeasured_stock(pantry_items, product):
        available = needed

    to_buy = needed - available
    if to_buy < _ZERO:
        # Ter três quilos em casa não gera crédito de compra.
        to_buy = _ZERO

    return PantryCoverage(
        needed=needed,
        available=available,
        to_buy=_quantize(to_buy),
        fully_covered=to_buy == _ZERO,
        has_unmeasured_items=unmeasured,
        base_unit=product.base_unit,
    )


def user_pantry(session: Session, user_id: uuid.UUID) -> list[PantryItem]:
    """A despensa de um usuário, do item mais recente ao mais antigo."""
    return list(
        session.scalars(
            select(PantryItem)
            .where(PantryItem.user_id == user_id)
            .order_by(PantryItem.created_at.desc())
        ).all()
    )


def suggest_products(session: Session, pantry_item: PantryItem) -> list[ScoredProduct]:
    """Produtos do catálogo parecidos com o que a pessoa digitou.

    Só sugere: quem confirma qual é o produto é o usuário, como no casamento do
    item do plano. Enquanto não confirma, `product_id` fica nulo e o item não
    abate nada da lista.
    """
    catalog = session.scalars(select(Product)).all()
    return rank_by_food_name(pantry_item.raw_description, catalog)


def name_variants(name: str) -> list[str]:
    """O nome normalizado, no singular e no plural da primeira palavra.

    A pessoa (ou a foto) diz "ovo" e o catálogo vende "Ovos de galinha"; diz
    "bananas" e o catálogo vende "Banana prata". O motor de casamento compara
    texto e não sabe que as duas formas são o mesmo alimento, então a busca é
    feita com as duas. Regras simples do português bastam aqui: a forma que não
    existir no catálogo não casa com nada e só fica de fora.
    """
    normalized = normalize_text(name)
    if not normalized:
        return []
    first, _, rest = normalized.partition(" ")
    rest = f" {rest}" if rest else ""

    if first.endswith("oes") or first.endswith("aes"):
        forms = [first[:-3] + "ao"]  # pães → pão
    elif first.endswith("es") and first[-3:-2] in ("r", "z"):
        forms = [first[:-2]]  # colheres → colher
    elif first.endswith("s"):
        forms = [first[:-1]]  # ovos → ovo
    elif first.endswith("ao"):
        forms = [first[:-2] + "oes", first[:-2] + "aes"]  # limão → limões
    elif first.endswith(("r", "z")):
        forms = [first + "es"]  # noz → nozes
    else:
        forms = [first + "s"]  # ovo → ovos

    return [normalized] + [form + rest for form in forms]


def _starts_with(product: Product, variants: Sequence[str]) -> bool:
    """O nome do produto começa pelo alimento, como palavra inteira.

    "Tomate italiano" começa por "tomate"; "Molho de tomate" não — é outro
    produto feito de tomate.
    """
    return any(
        product.normalized_name == variant or product.normalized_name.startswith(variant + " ")
        for variant in variants
    )


def rank_by_food_name(
    name: str, catalog: Sequence[Product], limit: int = MAX_CANDIDATES
) -> list[ScoredProduct]:
    """Os produtos que podem ser um alimento da despensa, do mais provável ao menos.

    Serve à busca do cadastro manual, aos candidatos de um item já salvo e à
    foto. Duas correções sobre `rank_products` — o casamento do plano alimentar
    continua como está:

    - busca com o singular e o plural (`name_variants`) e fica com a melhor
      nota de cada produto;
    - entre os que passam do corte, o produto cujo nome **começa** pelo
      alimento vem antes. O motor dá a mesma nota a todo produto que contém a
      palavra, e sem isso "tomate" propunha "Molho de tomate" antes de
      "Tomate italiano".

    Um produto que começa pelo alimento como palavra inteira sempre passa do
    corte (o comparador por palavras dá nota cheia), então a preferência nunca
    põe um produto fraco na frente de um bom.
    """
    variants = name_variants(name)
    best: dict[int, ScoredProduct] = {}
    for variant in variants:
        for scored in rank_products(variant, catalog, len(catalog)):
            atual = best.get(id(scored.product))
            if atual is None or scored.score > atual.score:
                best[id(scored.product)] = scored

    ranked = sorted(
        best.values(),
        key=lambda scored: (
            scored.score < MINIMUM_SCORE,
            not _starts_with(scored.product, variants),
            -scored.score,
            scored.product.name,
        ),
    )
    return ranked[:limit]
