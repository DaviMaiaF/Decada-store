"""Geração da lista de compras a partir de um plano alimentar.

Este módulo não decide nada sozinho: ele encadeia o que as etapas anteriores já
resolveram. Para cada item do plano que o usuário confirmou, desconta o que a
despensa cobre e manda precificar o que sobrou.

Regras que este módulo faz valer:
  - só entra na lista item com produto confirmado pelo usuário;
  - a quantidade gravada é a que se leva do mercado, já descontada a despensa;
  - o que veio de casa fica registrado, para a tela poder explicar o desconto;
  - item coberto por inteiro continua na lista, com quantidade zero;
  - a despensa nunca abate mais do que o item pedia;
  - o mesmo produto não entra duas vezes na lista: itens do plano que pedem o
    mesmo produto são somados numa linha, e a despensa abate uma vez só;
  - item vindo da prescrição não pode ser removido; item avulso pode;
  - a lista não se corrige quando o plano muda: ela diz o que divergiu.

Depois de gerada, a lista aceita item avulso: o que a pessoa acrescenta à
compra sem que o plano o tenha pedido. Ele muda a compra, nunca a prescrição —
é a diferença que a decisão 8 exige.

A quantidade é gravada na unidade base do produto (kg, l ou unidade), que é a
mesma em que o preço é expresso e em que a despensa foi descontada. Converter de
volta para a unidade da prescrição só reintroduziria arredondamento; quem exibe
"0,300 kg" como "300 g" é a interface.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import MealPlan, PlanItem, Product, ShoppingList, ShoppingListItem
from app.models.enums import MeasurementUnit, PlanChange, PlanItemStatus
from app.services.pantry import coverage, ensure_measurable, user_pantry
from app.services.pricing import (
    ShoppingListCost,
    list_total,
    price_item,
    price_shopping_list,
)
from app.services.units import (
    IncompatibleUnitError,
    base_unit_of,
    measurement_unit_of,
    to_base_quantity,
)


class ProductAlreadyInListError(Exception):
    """O produto já está na lista — pelo plano ou como avulso.

    Acrescentar de novo criaria duas linhas do mesmo produto, e a segunda
    abateria da despensa um estoque que a primeira já consumiu: a pessoa
    compraria menos do que precisa achando que tinha em casa.
    """


class PrescribedItemError(Exception):
    """Tentativa de tirar da lista um item que veio da prescrição.

    O aplicativo não altera o que a nutricionista mandou comprar (decisão 4).
    Quem quiser comparar a compra sem um item tem a simulação, que não grava.
    """


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
    # Mesmo produto em duas refeições vira uma linha só: o plano pede o arroz no
    # almoço e no jantar, mas no mercado é um pacote que serve aos dois.
    # Chave: produto; valor: itens do plano e a soma na unidade base.
    grupos: dict[uuid.UUID, tuple[list[PlanItem], Decimal]] = {}

    for plan_item in meal_plan.items:
        # Produto e status: a confirmação é um ato do usuário, e sem ela não há
        # o que comprar. Ter só o produto preenchido não basta.
        if plan_item.product is None or plan_item.status is not PlanItemStatus.CONFIRMADO:
            skipped += 1
            continue

        product = plan_item.product

        try:
            needed = to_base_quantity(plan_item.quantity, plan_item.unit, product.base_unit)
        except IncompatibleUnitError:
            # A unidade do plano não é da mesma grandeza que a do produto. O
            # casamento não deveria ter permitido, mas se chegou aqui o item
            # fica de fora em vez de virar uma quantidade inventada.
            skipped += 1
            continue

        itens, soma = grupos.get(product.id, ([], Decimal("0")))
        itens.append(plan_item)
        grupos[product.id] = (itens, soma + needed)

    for itens, soma in grupos.values():
        primeiro = itens[0]
        product = primeiro.product
        unit = measurement_unit_of(product.base_unit)
        # A despensa é descontada uma vez, do total: abater por linha gastaria
        # o mesmo estoque duas vezes.
        covered = coverage(soma, unit, product, pantry_items)

        shopping_list.items.append(
            ShoppingListItem(
                # A linha aponta para o primeiro item do plano; os demais do
                # mesmo produto são reconhecidos por `outdated_items`.
                plan_item=primeiro,
                product=product,
                quantity=covered.to_buy,
                unit=unit,
                # A despensa abate no máximo o que o item pedia: ter três quilos
                # em casa não faz o plano ter pedido três quilos.
                quantity_from_pantry=min(covered.available, covered.needed),
                match_score=primeiro.match_score,
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


def add_extra_item(
    session: Session,
    shopping_list: ShoppingList,
    product: Product,
    quantity: Decimal,
    unit: MeasurementUnit,
    *,
    reference: datetime | None = None,
) -> ShoppingListItem:
    """Acrescenta à lista um produto que o plano não pediu.

    É o "+ chia" da receita e o item que acabou em casa: a prescrição continua
    intocada, e o que muda é a compra. A despensa abate como em qualquer item —
    ter chia em casa não deixa de ser verdade porque o pedido veio do usuário.

    Só o item novo é precificado. Reprecificar a lista inteira aqui trocaria os
    preços congelados na geração por outros, e o total deixaria de ser
    reproduzível — a mesma razão pela qual a simulação usa o preço congelado.
    Por isso `calculated_at` também não se move: ele diz quando a lista foi
    precificada, e isso não aconteceu de novo.

    Não confirma a transação: quem chama decide quando fazer commit.
    """
    if any(item.product_id == product.id for item in shopping_list.items):
        raise ProductAlreadyInListError(f"{product.name} já está nesta lista de compras")

    ensure_measurable(product, unit)

    pantry_items = user_pantry(session, shopping_list.meal_plan.user_id)
    covered = coverage(quantity, unit, product, pantry_items)

    item = ShoppingListItem(
        product=product,
        quantity=covered.to_buy,
        unit=measurement_unit_of(product.base_unit),
        quantity_from_pantry=min(covered.available, covered.needed),
    )
    shopping_list.items.append(item)
    # Sem flush o preço não consegue ler o item recém-criado.
    session.flush()

    price_item(
        session, item, shopping_list.state_code, shopping_list.city, reference=reference
    )
    shopping_list.estimated_total = list_total(shopping_list)

    return item


def remove_item(session: Session, item: ShoppingListItem) -> None:
    """Tira da lista um item avulso e refaz o total.

    Item vindo do plano não sai: a decisão 8 vale aqui: o aplicativo pode
    comparar preços do que foi prescrito, nunca decidir que a pessoa não deve
    levar um alimento.
    """
    if not item.is_extra:
        raise PrescribedItemError(
            "este item veio da prescrição e não pode sair da lista;"
            " use a simulação para ver a compra sem ele"
        )

    shopping_list = item.shopping_list
    shopping_list.items.remove(item)
    session.flush()

    shopping_list.estimated_total = list_total(shopping_list)


@dataclass(frozen=True)
class OutdatedItem:
    """Um item do plano que mudou depois de a lista ser gerada."""

    plan_item: PlanItem
    change: PlanChange


def outdated_items(shopping_list: ShoppingList) -> list[OutdatedItem]:
    """O que mudou no plano desde que a lista foi gerada.

    A lista é um retrato: produto e preço ficam congelados na geração, e é isso
    que torna o total reproduzível. O preço do retrato, a pessoa sabe que é do
    dia em que gerou; o produto, não — trocar o frango na aba Dieta e ver o
    antigo no Mercado parece defeito. Por isso a lista não se corrige sozinha,
    mas diz o que divergiu, e quem decide gerar de novo é a pessoa.

    Só compara o que a geração usa: item confirmado com produto. Item de
    grandeza incompatível com o produto não conta como novo — a geração o
    deixaria de fora outra vez, e o aviso nunca sairia da tela.
    """
    in_list = {
        item.plan_item_id: item for item in shopping_list.items if item.plan_item_id is not None
    }
    # Itens do plano somados na mesma linha: só a primeira aponta para ela.
    products_in_list = {
        item.product_id for item in shopping_list.items if item.plan_item_id is not None
    }
    # O que a linha cobria é o que ela compra mais o que veio da despensa.
    covered_by_row = {
        item.product_id: item.quantity + item.quantity_from_pantry
        for item in shopping_list.items
        if item.plan_item_id is not None
    }
    # O que o plano confirma hoje por produto, na unidade base.
    confirmed_now: dict[uuid.UUID, Decimal] = {}
    for plan_item in shopping_list.meal_plan.items:
        if plan_item.product is None or plan_item.status is not PlanItemStatus.CONFIRMADO:
            continue
        try:
            needed = to_base_quantity(
                plan_item.quantity, plan_item.unit, plan_item.product.base_unit
            )
        except IncompatibleUnitError:
            continue
        confirmed_now[plan_item.product_id] = confirmed_now.get(plan_item.product_id, 0) + needed
    changes: list[OutdatedItem] = []

    for plan_item in shopping_list.meal_plan.items:
        confirmed = (
            plan_item.product is not None and plan_item.status is PlanItemStatus.CONFIRMADO
        )
        list_item = in_list.get(plan_item.id)

        if list_item is not None:
            if not confirmed:
                changes.append(OutdatedItem(plan_item, PlanChange.NAO_CONFIRMADO))
            elif list_item.product_id != plan_item.product_id:
                changes.append(OutdatedItem(plan_item, PlanChange.PRODUTO_TROCADO))
        elif (
            confirmed
            and plan_item.product_id not in products_in_list
            and base_unit_of(plan_item.unit) is plan_item.product.base_unit
        ):
            changes.append(OutdatedItem(plan_item, PlanChange.NOVO_CONFIRMADO))
        elif (
            not confirmed
            and plan_item.product_id in covered_by_row
            # Só quem foi somado na linha: o item que nunca foi confirmado não
            # tirou nada da conta, e o plano ainda confirma o que ela cobria.
            and confirmed_now.get(plan_item.product_id, Decimal("0")).quantize(Decimal("0.001"))
            < covered_by_row[plan_item.product_id]
        ):
            changes.append(OutdatedItem(plan_item, PlanChange.NAO_CONFIRMADO))

    return changes
