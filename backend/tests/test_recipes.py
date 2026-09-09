"""Testes da sugestão de receitas.

O cálculo de disponibilidade é função pura sobre objetos em memória. Só a
sugestão a partir do catálogo e a checagem do seed precisam de Postgres.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import PantryItem, Product, Recipe, RecipeIngredient, ShoppingList, ShoppingListItem
from app.models.enums import BaseUnit, MeasurementUnit
from app.seeds.catalog import PRODUCTS
from app.seeds.recipes import RECIPES
from app.services.recipes import availability, suggest_recipes
from app.services.units import base_unit_of
from tests.conftest import novo_usuario

AGORA = datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)

G = MeasurementUnit.GRAMA
KG = MeasurementUnit.QUILOGRAMA
ML = MeasurementUnit.MILILITRO
UN = MeasurementUnit.UNIDADE


def _produto(nome: str, base_unit: BaseUnit = BaseUnit.QUILOGRAMA) -> Product:
    return Product(
        id=uuid.uuid4(),
        slug=nome,
        name=nome,
        normalized_name=nome,
        base_unit=base_unit,
    )


def _receita(nome: str, *ingredientes: RecipeIngredient) -> Recipe:
    return Recipe(id=uuid.uuid4(), slug=nome, name=nome, ingredients=list(ingredientes))


def _ingrediente(
    produto: Product, quantidade: str, unidade: MeasurementUnit, optional: bool = False
) -> RecipeIngredient:
    return RecipeIngredient(
        product=produto,
        product_id=produto.id,
        quantity=Decimal(quantidade),
        unit=unidade,
        optional=optional,
    )


def _na_despensa(produto: Product, quantidade: str | None, unidade=None) -> PantryItem:
    return PantryItem(
        user_id=uuid.uuid4(),
        raw_description=produto.name,
        product_id=produto.id,
        quantity=Decimal(quantidade) if quantidade is not None else None,
        unit=unidade,
    )


def _na_lista(produto: Product, quantidade: str, unidade: MeasurementUnit) -> ShoppingList:
    lista = ShoppingList(state_code="DF", city="Brasília")
    lista.items.append(
        ShoppingListItem(
            product=produto,
            product_id=produto.id,
            quantity=Decimal(quantidade),
            unit=unidade,
        )
    )
    return lista


# --------------------------------------------------------------------------
# porcentagem por contagem de ingredientes
# --------------------------------------------------------------------------

def test_receita_com_tudo_em_casa_fica_completa():
    aveia = _produto("aveia")
    banana = _produto("banana")
    receita = _receita("panqueca", _ingrediente(aveia, "60", G), _ingrediente(banana, "200", G))
    despensa = [_na_despensa(aveia, "500", G), _na_despensa(banana, "1", KG)]

    resultado = availability(receita, despensa)

    assert resultado.percentage == 100
    assert resultado.complete is True
    assert resultado.missing == []


def test_porcentagem_e_a_proporcao_de_ingredientes_obrigatorios():
    a, b, c, d = (_produto(nome) for nome in "abcd")
    receita = _receita(
        "receita",
        _ingrediente(a, "10", G),
        _ingrediente(b, "10", G),
        _ingrediente(c, "10", G),
        _ingrediente(d, "10", G),
    )

    resultado = availability(receita, [_na_despensa(a, "50", G), _na_despensa(b, "50", G)])

    # Dois de quatro obrigatórios.
    assert (resultado.required_available, resultado.required_total) == (2, 4)
    assert resultado.percentage == 50


def test_lista_o_que_falta_pelo_nome():
    aveia = _produto("aveia")
    chia = _produto("chia")
    receita = _receita("bowl", _ingrediente(aveia, "30", G), _ingrediente(chia, "10", G))

    resultado = availability(receita, [_na_despensa(aveia, "500", G)])

    assert [item.product.name for item in resultado.missing] == ["chia"]
    assert resultado.complete is False


def test_receita_sem_nada_em_casa_fica_em_zero():
    receita = _receita("receita", _ingrediente(_produto("x"), "10", G))

    resultado = availability(receita, [])

    assert resultado.percentage == 0
    assert resultado.complete is False


# --------------------------------------------------------------------------
# ingrediente opcional
# --------------------------------------------------------------------------

def test_opcional_que_falta_nao_derruba_a_porcentagem():
    ovos = _produto("ovos", BaseUnit.UNIDADE)
    azeite = _produto("azeite", BaseUnit.LITRO)
    receita = _receita(
        "omelete",
        _ingrediente(ovos, "3", UN),
        _ingrediente(azeite, "5", ML, optional=True),
    )

    resultado = availability(receita, [_na_despensa(ovos, "12", UN)])

    assert resultado.percentage == 100
    assert resultado.complete is True
    # Some da conta, mas continua visível: a tela pode dizer "sem o azeite".
    assert [item.product.name for item in resultado.missing_optional] == ["azeite"]


def test_receita_so_de_opcionais_conta_como_completa():
    receita = _receita("tempero", _ingrediente(_produto("sal"), "1", G, optional=True))

    resultado = availability(receita, [])

    assert resultado.percentage == 100
    assert resultado.required_total == 0


# --------------------------------------------------------------------------
# quantidade
# --------------------------------------------------------------------------

def test_quantidade_insuficiente_conta_como_faltando():
    aveia = _produto("aveia")
    receita = _receita("bowl", _ingrediente(aveia, "100", G))

    resultado = availability(receita, [_na_despensa(aveia, "50", G)])

    assert resultado.percentage == 0
    assert [item.product.name for item in resultado.missing] == ["aveia"]


def test_quantidade_exata_basta():
    aveia = _produto("aveia")
    receita = _receita("bowl", _ingrediente(aveia, "100", G))

    resultado = availability(receita, [_na_despensa(aveia, "100", G)])

    assert resultado.percentage == 100


def test_soma_varios_itens_do_mesmo_produto_na_despensa():
    aveia = _produto("aveia")
    receita = _receita("bowl", _ingrediente(aveia, "100", G))
    despensa = [_na_despensa(aveia, "60", G), _na_despensa(aveia, "60", G)]

    assert availability(receita, despensa).percentage == 100


def test_item_sem_quantidade_conta_como_disponivel():
    # Regra diferente da lista de compras, e de propósito: aqui o custo do erro
    # é uma sugestão imprecisa, não uma compra a menos.
    canela = _produto("canela")
    receita = _receita("bolo", _ingrediente(canela, "5", G))

    resultado = availability(receita, [_na_despensa(canela, None)])

    assert resultado.percentage == 100


def test_unidade_incompativel_na_receita_conta_como_faltando():
    # Receita pedindo mililitro de um produto vendido por quilo.
    farinha = _produto("farinha")
    receita = _receita("bolo", _ingrediente(farinha, "200", ML))

    resultado = availability(receita, [_na_despensa(farinha, "1", KG)])

    assert resultado.percentage == 0


# --------------------------------------------------------------------------
# a lista de compras também conta
# --------------------------------------------------------------------------

def test_ingrediente_na_lista_de_compras_conta_como_disponivel():
    chia = _produto("chia")
    receita = _receita("bowl", _ingrediente(chia, "10", G))

    resultado = availability(receita, [], _na_lista(chia, "0.2", KG))

    assert resultado.percentage == 100


def test_despensa_e_lista_somam():
    aveia = _produto("aveia")
    receita = _receita("bowl", _ingrediente(aveia, "100", G))

    # Nem a despensa nem a lista bastam sozinhas; juntas, sim.
    resultado = availability(receita, [_na_despensa(aveia, "60", G)], _na_lista(aveia, "0.06", KG))

    assert resultado.percentage == 100


def test_sem_lista_conta_so_a_despensa():
    chia = _produto("chia")
    receita = _receita("bowl", _ingrediente(chia, "10", G))

    assert availability(receita, []).percentage == 0


# --------------------------------------------------------------------------
# o seed de receitas
# --------------------------------------------------------------------------

def test_toda_receita_do_seed_usa_produto_existente_no_catalogo():
    nomes = {produto.name for produto in PRODUCTS}

    for receita in RECIPES:
        for ingrediente in receita.ingredients:
            assert ingrediente.product_name in nomes, (
                f"{receita.slug} cita produto inexistente: {ingrediente.product_name}"
            )


def test_toda_unidade_do_seed_e_compativel_com_a_do_produto():
    # Uma unidade de outra grandeza faria a receita nunca ficar disponível,
    # e o erro só apareceria em tela.
    produtos = {produto.name: produto for produto in PRODUCTS}

    for receita in RECIPES:
        for ingrediente in receita.ingredients:
            produto = produtos[ingrediente.product_name]
            assert base_unit_of(ingrediente.unit) is produto.base_unit, (
                f"{receita.slug}: {ingrediente.product_name} é vendido em "
                f"{produto.base_unit.value}, mas a receita pede {ingrediente.unit.value}"
            )


def test_toda_receita_do_seed_tem_ingrediente_obrigatorio():
    for receita in RECIPES:
        assert any(not item.optional for item in receita.ingredients), receita.slug


# --------------------------------------------------------------------------
# sugestão a partir do banco
# --------------------------------------------------------------------------

@pytest.fixture
def usuario_com_despensa(db_session):
    """Usuário com aveia, banana e ovos em casa — a panqueca fica completa."""
    from app.seeds.runner import run as carregar_seed

    carregar_seed(db_session)

    def produto(nome: str) -> Product:
        return db_session.scalars(select(Product).where(Product.name == nome)).one()

    pessoa = novo_usuario(
        "marina@decada.local",
        pantry_items=[
            PantryItem(raw_description="aveia", product=produto("Aveia em flocos"),
                       quantity=Decimal("500"), unit=G),
            PantryItem(raw_description="banana", product=produto("Banana prata"),
                       quantity=Decimal("1"), unit=KG),
            PantryItem(raw_description="ovos", product=produto("Ovos de galinha"),
                       quantity=Decimal("12"), unit=UN),
        ],
    )
    db_session.add(pessoa)
    db_session.commit()
    return pessoa


@pytest.mark.db
def test_sugere_a_receita_que_da_para_fazer_agora(db_session, usuario_com_despensa):
    sugestoes = suggest_recipes(db_session, usuario_com_despensa.id)

    assert sugestoes[0].recipe.slug == "panqueca-de-aveia-e-banana"
    assert sugestoes[0].percentage == 100


@pytest.mark.db
def test_sugestoes_vem_da_mais_disponivel_para_a_menos(db_session, usuario_com_despensa):
    percentuais = [item.percentage for item in suggest_recipes(db_session, usuario_com_despensa.id)]

    assert percentuais == sorted(percentuais, reverse=True)
    assert len(percentuais) == len(RECIPES)


@pytest.mark.db
def test_filtra_pelo_percentual_minimo(db_session, usuario_com_despensa):
    completas = suggest_recipes(db_session, usuario_com_despensa.id, minimum_percentage=100)

    assert completas
    assert all(item.complete for item in completas)


@pytest.mark.db
def test_despensa_vazia_nao_completa_nenhuma_receita(db_session):
    from app.seeds.runner import run as carregar_seed

    carregar_seed(db_session)
    pessoa = novo_usuario("vazia@decada.local")
    db_session.add(pessoa)
    db_session.commit()

    sugestoes = suggest_recipes(db_session, pessoa.id)

    assert sugestoes
    assert all(item.percentage == 0 for item in sugestoes)


@pytest.mark.db
def test_a_lista_de_compras_aumenta_a_disponibilidade(db_session, usuario_com_despensa):
    """A mesma despensa, com uma lista de compras, completa mais receitas."""
    from app.models import MealPlan, PlanItem
    from app.models.enums import PlanItemStatus
    from app.services.shopping import generate_shopping_list

    def produto(nome: str) -> Product:
        return db_session.scalars(select(Product).where(Product.name == nome)).one()

    pessoa = usuario_com_despensa
    sem_lista = sum(1 for item in suggest_recipes(db_session, pessoa.id) if item.complete)

    plano = MealPlan(
        user=pessoa,
        consent_at=AGORA,
        consent_version="v1",
        items=[
            PlanItem(position=1, raw_description="200 g de mamão", quantity=Decimal("200"),
                     unit=G, product=produto("Mamão papaia"), status=PlanItemStatus.CONFIRMADO),
            PlanItem(position=2, raw_description="200 ml de leite", quantity=Decimal("200"),
                     unit=ML, product=produto("Leite integral UHT"),
                     status=PlanItemStatus.CONFIRMADO),
        ],
    )
    db_session.add(plano)
    db_session.flush()
    lista = generate_shopping_list(db_session, plano, "DF", "Brasília").shopping_list

    com_lista = sum(1 for item in suggest_recipes(db_session, pessoa.id, lista) if item.complete)

    # A vitamina de mamão passa a ser possível: mamão e leite entram pela lista,
    # e a aveia já estava em casa.
    assert com_lista > sem_lista
