"""Que receitas dá para fazer com o que já se tem.

Disponibilidade é medida contra duas fontes somadas: a despensa (o que está em
casa agora) e a lista de compras (o que será comprado). Uma receita "100%
disponível" é uma receita que não exige nenhuma ida extra ao mercado.

Regras que este módulo faz valer:
  - a porcentagem é a proporção de ingredientes obrigatórios disponíveis, não
    uma média ponderada por quantidade: "faltam 2 de 5" é explicável, "falta 40%
    da chia" não é;
  - ingrediente opcional não conta na porcentagem nem impede a sugestão;
  - item da despensa sem quantidade conta como disponível.

Essa última regra é deliberadamente diferente da que vale para a lista de
compras, onde item sem quantidade não abate nada. Lá, assumir quantidade faz a
pessoa chegar em casa sem comida; aqui, o custo do erro é uma sugestão de receita
imprecisa. Sem isso, um vidro de canela sem gramatura derrubaria quase toda
receita para menos de 100%.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import PantryItem, Product, Recipe, RecipeIngredient, ShoppingList
from app.services.pantry import available_quantity, user_pantry
from app.services.units import IncompatibleUnitError, to_base_quantity


@dataclass(frozen=True)
class RecipeAvailability:
    """O quanto uma receita já está coberta pelo que a pessoa tem."""

    recipe: Recipe
    # Só os obrigatórios entram na conta da porcentagem.
    required_total: int
    required_available: int
    # Obrigatórios que faltam — é o que a tela mostra como "falta chia".
    missing: list[RecipeIngredient]
    # Opcionais que faltam. Não afetam a porcentagem.
    missing_optional: list[RecipeIngredient]
    # De 0 a 100, inteiro.
    percentage: int

    @property
    def complete(self) -> bool:
        """Dá para fazer agora, sem comprar mais nada além do que já está previsto."""
        return not self.missing


def _available_in_base(
    product: Product,
    pantry_items: Sequence[PantryItem],
    list_quantities: dict[uuid.UUID, Decimal],
) -> tuple[Decimal, bool]:
    """Quanto se tem deste produto somando despensa e lista, na unidade base."""
    from_pantry, unmeasured = available_quantity(pantry_items, product)
    return from_pantry + list_quantities.get(product.id, Decimal("0")), unmeasured


def _list_quantities(shopping_list: ShoppingList | None) -> dict[uuid.UUID, Decimal]:
    """Quanto cada produto da lista de compras vai render, na unidade base."""
    quantities: dict[uuid.UUID, Decimal] = {}
    if shopping_list is None:
        return quantities

    for item in shopping_list.items:
        try:
            in_base = to_base_quantity(item.quantity, item.unit, item.product.base_unit)
        except IncompatibleUnitError:
            continue
        quantities[item.product_id] = quantities.get(item.product_id, Decimal("0")) + in_base

    return quantities


def availability(
    recipe: Recipe,
    pantry_items: Sequence[PantryItem],
    shopping_list: ShoppingList | None = None,
) -> RecipeAvailability:
    """Disponibilidade de uma receita. Função pura sobre objetos já carregados."""
    quantities = _list_quantities(shopping_list)

    required_total = 0
    required_available = 0
    missing: list[RecipeIngredient] = []
    missing_optional: list[RecipeIngredient] = []

    for ingredient in recipe.ingredients:
        product = ingredient.product
        have, unmeasured = _available_in_base(product, pantry_items, quantities)

        try:
            needed = to_base_quantity(ingredient.quantity, ingredient.unit, product.base_unit)
            # Ter o item em casa sem saber quanto conta como ter o bastante.
            has_enough = unmeasured or have >= needed
        except IncompatibleUnitError:
            # Receita cadastrada com unidade de outra grandeza que a do produto.
            # Não dá para comparar, então o ingrediente conta como faltando.
            has_enough = False

        if ingredient.optional:
            if not has_enough:
                missing_optional.append(ingredient)
            continue

        required_total += 1
        if has_enough:
            required_available += 1
        else:
            missing.append(ingredient)

    if required_total == 0:
        # Receita só de opcionais: não há nada obrigatório faltando.
        percentage = 100
    else:
        percentage = round(required_available * 100 / required_total)

    return RecipeAvailability(
        recipe=recipe,
        required_total=required_total,
        required_available=required_available,
        missing=missing,
        missing_optional=missing_optional,
        percentage=percentage,
    )


def suggest_recipes(
    session: Session,
    user_id: uuid.UUID,
    shopping_list: ShoppingList | None = None,
    *,
    minimum_percentage: int = 0,
) -> list[RecipeAvailability]:
    """Receitas ordenadas da mais disponível para a menos.

    Empate na porcentagem é desfeito pelo nome, para a ordem não variar entre
    execuções. `minimum_percentage` corta o rodapé da lista — passar 100 devolve
    só o que dá para fazer agora.
    """
    pantry_items = user_pantry(session, user_id)

    recipes = session.scalars(
        select(Recipe).options(
            selectinload(Recipe.ingredients).selectinload(RecipeIngredient.product)
        )
    ).all()

    results = [availability(recipe, pantry_items, shopping_list) for recipe in recipes]
    results = [result for result in results if result.percentage >= minimum_percentage]
    results.sort(key=lambda result: (-result.percentage, result.recipe.name))
    return results
