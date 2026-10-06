"""Testes da geração da lista de compras.

Todos usam o banco: a geração encadeia despensa e preço, e o preço vem dos
registros do seed.
"""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import MealPlan, PantryItem, PlanItem, Product, ShoppingList, User
from app.models.enums import MeasurementUnit, PlanItemStatus
from app.services.shopping import (
    PrescribedItemError,
    ProductAlreadyInListError,
    add_extra_item,
    generate_shopping_list,
    remove_item,
)
from app.services.units import IncompatibleUnitError
from tests.conftest import novo_usuario

pytestmark = pytest.mark.db

AGORA = datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)

KG = MeasurementUnit.QUILOGRAMA
G = MeasurementUnit.GRAMA
ML = MeasurementUnit.MILILITRO
UN = MeasurementUnit.UNIDADE

FRANGO = "Peito de frango sem pele"
QUEIJO = "Queijo minas frescal"


@pytest.fixture
def catalogo_carregado(db_session):
    def buscar(nome: str) -> Product:
        return db_session.scalars(select(Product).where(Product.name == nome)).one()

    return buscar


@pytest.fixture
def usuario(db_session):
    pessoa = novo_usuario("marina@decada.local")
    db_session.add(pessoa)
    db_session.flush()
    return pessoa


def _plano(usuario: User, *items: PlanItem) -> MealPlan:
    return MealPlan(user=usuario, consent_at=AGORA, consent_version="v1", items=list(items))


def _item(
    posicao: int,
    descricao: str,
    quantidade: str,
    unidade: MeasurementUnit,
    produto: Product | None = None,
    status: PlanItemStatus = PlanItemStatus.CONFIRMADO,
) -> PlanItem:
    return PlanItem(
        position=posicao,
        raw_description=descricao,
        quantity=Decimal(quantidade),
        unit=unidade,
        product=produto,
        status=status,
    )


def _guardar(db_session, item: PantryItem, usuario: User) -> None:
    item.user_id = usuario.id
    db_session.add(item)
    db_session.flush()


# --------------------------------------------------------------------------
# o que entra e o que fica de fora
# --------------------------------------------------------------------------

def test_gera_a_lista_com_os_itens_confirmados(db_session, usuario, catalogo_carregado):
    plano = _plano(
        usuario,
        _item(1, "1,2 kg de peito de frango", "1.2", KG, catalogo_carregado(FRANGO)),
        _item(2, "300 g de queijo minas", "300", G, catalogo_carregado(QUEIJO)),
    )
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)

    assert resultado.items_to_buy == 2
    assert resultado.items_skipped == 0
    assert len(resultado.shopping_list.items) == 2
    assert resultado.shopping_list.state_code == "DF"


def test_item_sem_produto_confirmado_fica_de_fora(db_session, usuario, catalogo_carregado):
    plano = _plano(
        usuario,
        _item(1, "1,2 kg de peito de frango", "1.2", KG, catalogo_carregado(FRANGO)),
        # Ninguém confirmou o que é "tempero a gosto".
        _item(2, "tempero a gosto", "1", UN, None, PlanItemStatus.NAO_IDENTIFICADO),
    )
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)

    assert resultado.items_to_buy == 1
    assert resultado.items_skipped == 1


def test_produto_escolhido_mas_ainda_nao_confirmado_fica_de_fora(
    db_session, usuario, catalogo_carregado
):
    # O casamento sugere; enquanto o status for pendente, a sugestão não vira compra.
    plano = _plano(
        usuario,
        _item(1, "peito de frango", "1.2", KG, catalogo_carregado(FRANGO), PlanItemStatus.PENDENTE),
    )
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)

    assert resultado.items_to_buy == 0
    assert resultado.items_skipped == 1
    assert resultado.shopping_list.items == []


def test_plano_sem_nenhuma_confirmacao_gera_lista_vazia(db_session, usuario, catalogo_carregado):
    plano = _plano(usuario, _item(1, "algo", "1", UN, None, PlanItemStatus.PENDENTE))
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)

    assert resultado.shopping_list.items == []
    assert resultado.cost.total == Decimal("0.00")


# --------------------------------------------------------------------------
# desconto da despensa
# --------------------------------------------------------------------------

def test_desconta_a_despensa_da_quantidade_a_comprar(db_session, usuario, catalogo_carregado):
    frango = catalogo_carregado(FRANGO)
    _guardar(db_session, PantryItem(raw_description="frango", product=frango,
                                    quantity=Decimal("0.5"), unit=KG), usuario)

    plano = _plano(usuario, _item(1, "1,2 kg de peito de frango", "1.2", KG, frango))
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)
    item = resultado.shopping_list.items[0]

    assert item.quantity == Decimal("0.700")
    assert item.quantity_from_pantry == Decimal("0.500")
    assert item.dispensed_by_pantry is False


def test_item_coberto_por_inteiro_continua_na_lista_com_quantidade_zero(
    db_session, usuario, catalogo_carregado
):
    frango = catalogo_carregado(FRANGO)
    _guardar(db_session, PantryItem(raw_description="frango", product=frango,
                                    quantity=Decimal("2"), unit=KG), usuario)

    plano = _plano(usuario, _item(1, "1,2 kg de peito de frango", "1.2", KG, frango))
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)
    item = resultado.shopping_list.items[0]

    assert item.quantity == Decimal("0.000")
    assert item.dispensed_by_pantry is True
    assert resultado.items_dispensed == 1
    assert resultado.items_to_buy == 0
    # Some da compra, não da lista: o usuário precisa poder ver o que foi dispensado.
    assert len(resultado.shopping_list.items) == 1


def test_despensa_nao_abate_mais_do_que_o_item_pedia(db_session, usuario, catalogo_carregado):
    frango = catalogo_carregado(FRANGO)
    _guardar(db_session, PantryItem(raw_description="frango", product=frango,
                                    quantity=Decimal("3"), unit=KG), usuario)

    plano = _plano(usuario, _item(1, "1,2 kg de peito de frango", "1.2", KG, frango))
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)

    # Ter três quilos em casa não faz o plano ter pedido três quilos.
    assert resultado.shopping_list.items[0].quantity_from_pantry == Decimal("1.200")


def test_despensa_de_outro_usuario_nao_entra_na_conta(db_session, usuario, catalogo_carregado):
    frango = catalogo_carregado(FRANGO)
    outro = novo_usuario("outro@decada.local")
    db_session.add(outro)
    db_session.flush()
    _guardar(db_session, PantryItem(raw_description="frango", product=frango,
                                    quantity=Decimal("2"), unit=KG), outro)

    plano = _plano(usuario, _item(1, "1,2 kg de peito de frango", "1.2", KG, frango))
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)

    assert resultado.shopping_list.items[0].quantity == Decimal("1.200")


def test_item_da_despensa_sem_quantidade_nao_abate(db_session, usuario, catalogo_carregado):
    frango = catalogo_carregado(FRANGO)
    _guardar(db_session, PantryItem(raw_description="frango", product=frango), usuario)

    plano = _plano(usuario, _item(1, "1,2 kg de peito de frango", "1.2", KG, frango))
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)
    item = resultado.shopping_list.items[0]

    assert item.quantity == Decimal("1.200")
    assert item.quantity_from_pantry == Decimal("0.000")


# --------------------------------------------------------------------------
# unidade e preço
# --------------------------------------------------------------------------

def test_grava_a_quantidade_na_unidade_base_do_produto(db_session, usuario, catalogo_carregado):
    # O plano pede em grama; o produto é vendido por quilo.
    plano = _plano(usuario, _item(1, "300 g de queijo minas", "300", G, catalogo_carregado(QUEIJO)))
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)
    item = resultado.shopping_list.items[0]

    assert item.unit is KG
    assert item.quantity == Decimal("0.300")


def test_lista_sai_precificada_com_data_e_origem(db_session, usuario, catalogo_carregado):
    plano = _plano(usuario, _item(1, "1,2 kg de peito de frango", "1.2", KG,
                                  catalogo_carregado(FRANGO)))
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)
    item = resultado.shopping_list.items[0]

    assert resultado.shopping_list.estimated_total > Decimal("0.00")
    assert item.estimated_cost > Decimal("0.00")
    # Nenhum preço anda sem data, origem e tamanho da amostra.
    assert item.price_reference_date is not None
    assert item.price_origin is not None
    assert item.price_confidence is not None
    assert item.price_sample_size > 0


def test_item_dispensado_nao_custa_nada(db_session, usuario, catalogo_carregado):
    frango = catalogo_carregado(FRANGO)
    _guardar(db_session, PantryItem(raw_description="frango", product=frango,
                                    quantity=Decimal("2"), unit=KG), usuario)

    plano = _plano(usuario, _item(1, "1,2 kg de peito de frango", "1.2", KG, frango))
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)

    assert resultado.shopping_list.items[0].estimated_cost == Decimal("0.00")
    assert resultado.cost.total == Decimal("0.00")


def test_despensa_barateia_a_lista(db_session, usuario, catalogo_carregado):
    """Mesmo plano, com e sem despensa: o total tem que cair."""
    frango = catalogo_carregado(FRANGO)

    plano = _plano(usuario, _item(1, "1,2 kg de peito de frango", "1.2", KG, frango))
    db_session.add(plano)
    db_session.flush()
    sem_despensa = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)
    total_sem_despensa = sem_despensa.cost.total

    _guardar(db_session, PantryItem(raw_description="frango", product=frango,
                                    quantity=Decimal("0.6"), unit=KG), usuario)
    com_despensa = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)

    assert com_despensa.cost.total < total_sem_despensa


def test_produto_embalado_cobra_a_embalagem_fechada(db_session, usuario, catalogo_carregado):
    # 300 g de um queijo vendido em pacote: paga-se o pacote inteiro.
    plano = _plano(usuario, _item(1, "300 g de queijo minas", "300", G, catalogo_carregado(QUEIJO)))
    db_session.add(plano)
    db_session.flush()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)

    assert resultado.shopping_list.items[0].packages_needed == 1


# --------------------------------------------------------------------------
# a lista fica gravada
# --------------------------------------------------------------------------

def test_gerar_duas_vezes_cria_duas_listas(db_session, usuario, catalogo_carregado):
    plano = _plano(usuario, _item(1, "1,2 kg de peito de frango", "1.2", KG,
                                  catalogo_carregado(FRANGO)))
    db_session.add(plano)
    db_session.flush()

    generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)
    generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)
    db_session.commit()

    listas = db_session.scalars(
        select(ShoppingList).where(ShoppingList.meal_plan_id == plano.id)
    ).all()
    assert len(listas) == 2


def test_a_escolha_confirmada_sobrevive_a_nova_geracao(db_session, usuario, catalogo_carregado):
    # É por isso que a confirmação mora no PlanItem: gerar de novo não pede
    # que o usuário confirme tudo outra vez.
    frango = catalogo_carregado(FRANGO)
    plano = _plano(usuario, _item(1, "1,2 kg de peito de frango", "1.2", KG, frango))
    plano.items[0].match_score = Decimal("0.930")
    db_session.add(plano)
    db_session.commit()

    resultado = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)
    item = resultado.shopping_list.items[0]

    assert item.product_id == frango.id
    assert item.match_score == Decimal("0.930")


# --------------------------------------------------------------------------
# item avulso: o que a pessoa acrescenta depois da lista pronta
# --------------------------------------------------------------------------

AVEIA = "Aveia em flocos"


def _lista_de_um_item(db_session, usuario, produto: Product) -> ShoppingList:
    """Uma lista já gerada e precificada, para o avulso chegar depois."""
    plano = _plano(usuario, _item(1, f"1,2 kg de {produto.name.lower()}", "1.2", KG, produto))
    db_session.add(plano)
    db_session.flush()
    gerada = generate_shopping_list(db_session, plano, "DF", "Brasília", reference=AGORA)
    return gerada.shopping_list


def test_item_avulso_entra_na_lista_precificado(db_session, usuario, catalogo_carregado):
    lista = _lista_de_um_item(db_session, usuario, catalogo_carregado(FRANGO))

    item = add_extra_item(
        db_session, lista, catalogo_carregado(AVEIA), Decimal("500"), G, reference=AGORA
    )

    assert item.is_extra
    assert item.plan_item_id is None
    assert item.estimated_cost > Decimal("0.00")
    # Nenhum preço anda sem data, origem e amostra — nem o que chegou depois.
    assert item.price_reference_date is not None
    assert item.price_origin is not None
    assert item.price_sample_size > 0


def test_o_avulso_soma_no_total_da_lista(db_session, usuario, catalogo_carregado):
    lista = _lista_de_um_item(db_session, usuario, catalogo_carregado(FRANGO))
    antes = lista.estimated_total

    item = add_extra_item(
        db_session, lista, catalogo_carregado(AVEIA), Decimal("500"), G, reference=AGORA
    )

    assert lista.estimated_total == antes + item.estimated_cost


def test_o_avulso_nao_reprecifica_o_que_a_lista_congelou(
    db_session, usuario, catalogo_carregado
):
    """O preço dos itens do plano é um retrato da geração, e continua sendo."""
    lista = _lista_de_um_item(db_session, usuario, catalogo_carregado(FRANGO))
    do_plano = lista.items[0]
    preco_congelado = do_plano.unit_price_snapshot
    precificada_em = lista.calculated_at

    add_extra_item(db_session, lista, catalogo_carregado(AVEIA), Decimal("500"), G, reference=AGORA)

    assert do_plano.unit_price_snapshot == preco_congelado
    # `calculated_at` diz quando a lista foi precificada, e isso não se repetiu.
    assert lista.calculated_at == precificada_em


def test_a_despensa_abate_o_avulso_como_qualquer_item(db_session, usuario, catalogo_carregado):
    aveia = catalogo_carregado(AVEIA)
    _guardar(db_session, PantryItem(raw_description="aveia", product=aveia,
                                    quantity=Decimal("200"), unit=G), usuario)

    lista = _lista_de_um_item(db_session, usuario, catalogo_carregado(FRANGO))
    item = add_extra_item(db_session, lista, aveia, Decimal("500"), G, reference=AGORA)

    # Pede 500 g, tem 200 g em casa: compra 300 g.
    assert item.quantity == Decimal("0.300")
    assert item.quantity_from_pantry == Decimal("0.200")


def test_despensa_que_cobre_tudo_deixa_o_avulso_dispensado(
    db_session, usuario, catalogo_carregado
):
    aveia = catalogo_carregado(AVEIA)
    _guardar(db_session, PantryItem(raw_description="aveia", product=aveia,
                                    quantity=Decimal("2"), unit=KG), usuario)

    lista = _lista_de_um_item(db_session, usuario, catalogo_carregado(FRANGO))
    item = add_extra_item(db_session, lista, aveia, Decimal("500"), G, reference=AGORA)

    # Continua na lista, com quantidade zero: some da compra, não da tela.
    assert item.dispensed_by_pantry


def test_produto_que_ja_esta_na_lista_nao_entra_de_novo(db_session, usuario, catalogo_carregado):
    """Duas linhas do mesmo produto abateriam a despensa duas vezes."""
    frango = catalogo_carregado(FRANGO)
    lista = _lista_de_um_item(db_session, usuario, frango)

    with pytest.raises(ProductAlreadyInListError):
        add_extra_item(db_session, lista, frango, Decimal("1"), KG, reference=AGORA)


def test_o_mesmo_avulso_duas_vezes_tambem_e_recusado(db_session, usuario, catalogo_carregado):
    lista = _lista_de_um_item(db_session, usuario, catalogo_carregado(FRANGO))
    aveia = catalogo_carregado(AVEIA)
    add_extra_item(db_session, lista, aveia, Decimal("500"), G, reference=AGORA)

    with pytest.raises(ProductAlreadyInListError):
        add_extra_item(db_session, lista, aveia, Decimal("500"), G, reference=AGORA)


def test_avulso_em_grandeza_que_o_produto_nao_usa_e_recusado(
    db_session, usuario, catalogo_carregado
):
    """Meio litro de uma aveia vendida por quilo não é pedido que se atenda."""
    lista = _lista_de_um_item(db_session, usuario, catalogo_carregado(FRANGO))

    with pytest.raises(IncompatibleUnitError):
        add_extra_item(
            db_session, lista, catalogo_carregado(AVEIA), Decimal("500"), ML, reference=AGORA
        )


def test_remover_o_avulso_devolve_o_total_ao_que_era(db_session, usuario, catalogo_carregado):
    lista = _lista_de_um_item(db_session, usuario, catalogo_carregado(FRANGO))
    antes = lista.estimated_total

    item = add_extra_item(
        db_session, lista, catalogo_carregado(AVEIA), Decimal("500"), G, reference=AGORA
    )
    remove_item(db_session, item)

    assert lista.estimated_total == antes
    assert len(lista.items) == 1


def test_item_da_prescricao_nao_sai_da_lista(db_session, usuario, catalogo_carregado):
    """Decisão 8: comparar preço do que foi prescrito, sim; tirar o alimento, não."""
    lista = _lista_de_um_item(db_session, usuario, catalogo_carregado(FRANGO))

    with pytest.raises(PrescribedItemError):
        remove_item(db_session, lista.items[0])

    assert len(lista.items) == 1
