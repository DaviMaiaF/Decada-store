"""Geração da lista de compras a partir de um plano alimentar.

Este módulo não decide nada sozinho: ele encadeia o que as etapas anteriores já
resolveram. Para cada item do plano que o usuário confirmou, desconta o que a
despensa cobre e manda precificar o que sobrou.

Regras que este módulo faz valer:
  - só entra na lista item com produto confirmado pelo usuário;
  - a quantidade gravada é a que se leva do mercado, já descontada a despensa;
  - o que veio de casa fica registrado, para a tela poder explicar o desconto;
  - item coberto por inteiro continua na lista, com quantidade zero;
  - a despensa nunca abate mais do que o item pedia.

A quantidade é gravada na unidade base do produto (kg, l ou unidade), que é a
mesma em que o preço é expresso e em que a despensa foi descontada. Converter de
volta para a unidade da prescrição só reintroduziria arredondamento; quem exibe
"0,300 kg" como "300 g" é a interface.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import MealPlan, ShoppingList, ShoppingListItem
from app.models.enums import PlanItemStatus
from app.services.pantry import coverage, user_pantry
from app.services.pricing import ShoppingListCost, price_shopping_list
from app.services.units import IncompatibleUnitError, measurement_unit_of


@dataclass(frozen=True)
class GeneratedList:
    """A lista gerada e o resumo do que aconteceu com cada item do plano."""

    shopping_list: ShoppingList
    # Itens com algo a comprar.
    items_to_buy: int
    # Itens que a despensa cobriu por inteiro.
    items_dispensed: int
    # Itens do plano que ficaram de fora: sem produto confirmado, ou com
    # unidade de grandeza incompatível com a do produto.
    items_skipped: int
    cost: ShoppingListCost


def generate_shopping_list(
    session: Session,
    meal_plan: MealPlan,
    state_code: str,
    city: str,
    *,
    reference: datetime | None = None,
) -> GeneratedList:
    """Monta e precifica a lista de compras de um plano, numa região.

    Não confirma a transação: quem chama decide quando fazer commit. Gerar duas
    vezes cria duas listas — o histórico de listas de um plano é proposital.
    """
    pantry_items = user_pantry(session, meal_plan.user_id)

    shopping_list = ShoppingList(meal_plan=meal_plan, state_code=state_code, city=city)
    # Entra na sessão antes do laço: percorrer os itens do plano pode disparar
    # autoflush, e uma lista ainda solta não seria gravada junto com o plano.
    session.add(shopping_list)

    skipped = 0

    for plan_item in meal_plan.items:
        # Produto e status: a confirmação é um ato do usuário, e sem ela não há
        # o que comprar. Ter só o produto preenchido não basta.
        if plan_item.product is None or plan_item.status is not PlanItemStatus.CONFIRMADO:
            skipped += 1
            continue

        product = plan_item.product

        try:
            covered = coverage(plan_item.quantity, plan_item.unit, product, pantry_items)
        except IncompatibleUnitError:
            # A unidade do plano não é da mesma grandeza que a do produto. O
            # casamento não deveria ter permitido, mas se chegou aqui o item
            # fica de fora em vez de virar uma quantidade inventada.
            skipped += 1
            continue

        shopping_list.items.append(
            ShoppingListItem(
                plan_item=plan_item,
                product=product,
                quantity=covered.to_buy,
                unit=measurement_unit_of(product.base_unit),
                # A despensa abate no máximo o que o item pedia: ter três quilos
                # em casa não faz o plano ter pedido três quilos.
                quantity_from_pantry=min(covered.available, covered.needed),
                match_score=plan_item.match_score,
            )
        )

    # Sem flush o preço não consegue ler os itens recém-criados.
    session.flush()

    cost = price_shopping_list(session, shopping_list, reference=reference)

    dispensed = sum(1 for item in shopping_list.items if item.dispensed_by_pantry)

    return GeneratedList(
        shopping_list=shopping_list,
        items_to_buy=sum(1 for item in shopping_list.items if item.quantity > Decimal("0")),
        items_dispensed=dispensed,
        items_skipped=skipped,
        cost=cost,
    )
