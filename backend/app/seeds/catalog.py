"""Catálogo fictício de desenvolvimento.

TODOS os dados deste arquivo são inventados. Nenhum preço aqui foi coletado de
mercado real e nenhuma marca citada existe — os nomes de marca são fictícios de
propósito, para que um preço falso nunca fique associado a uma marca real.
"""

from dataclasses import dataclass
from decimal import Decimal

from app.models.enums import BaseUnit, MeasurementUnit

G = MeasurementUnit.GRAMA
KG = MeasurementUnit.QUILOGRAMA
ML = MeasurementUnit.MILILITRO
L = MeasurementUnit.LITRO
UN = MeasurementUnit.UNIDADE

BASE_KG = BaseUnit.QUILOGRAMA
BASE_L = BaseUnit.LITRO
BASE_UN = BaseUnit.UNIDADE


@dataclass(frozen=True)
class MarketSeed:
    slug: str
    name: str
    chain: str | None
    state_code: str
    city: str
    # Quanto este mercado é mais caro ou mais barato que a referência.
    price_factor: Decimal


@dataclass(frozen=True)
class ProductSeed:
    name: str
    brand: str | None
    # Gramatura da embalagem. None significa vendido a granel (por kg).
    package_size: Decimal | None
    package_unit: MeasurementUnit | None
    base_unit: BaseUnit
    category: str
    # Preço de referência na unidade base: R$/kg, R$/l ou R$/unidade.
    base_price: Decimal


# Dois mercados em Brasília e um em Taguatinga: assim uma região fica com 6
# amostras por produto e a outra com 3, o que dá material para testar as regras
# de confiança da etapa 4 sem precisar inventar dados novos lá.
MARKETS: tuple[MarketSeed, ...] = (
    MarketSeed(
        "mercado-cerrado-ficticio",
        "Mercado Cerrado (fictício)",
        "Rede Cerrado",
        "DF",
        "Brasília",
        Decimal("0.95"),
    ),
    MarketSeed(
        "supermercado-planalto-ficticio",
        "Supermercado Planalto (fictício)",
        "Rede Planalto",
        "DF",
        "Brasília",
        Decimal("1.00"),
    ),
    MarketSeed(
        "hortifruti-boa-safra-ficticio",
        "Hortifrúti Boa Safra (fictício)",
        None,
        "DF",
        "Taguatinga",
        Decimal("1.08"),
    ),
)


def _product(
    name: str,
    brand: str | None,
    package_size: str | None,
    package_unit: MeasurementUnit | None,
    base_unit: BaseUnit,
    category: str,
    base_price: str,
) -> ProductSeed:
    return ProductSeed(
        name=name,
        brand=brand,
        package_size=Decimal(package_size) if package_size is not None else None,
        package_unit=package_unit,
        base_unit=base_unit,
        category=category,
        base_price=Decimal(base_price),
    )


_MERCEARIA = [
    _product("Arroz branco tipo 1", "Grão Fino", "5", KG, BASE_KG, "mercearia", "7.49"),
    _product("Arroz integral", "Grão Fino", "1", KG, BASE_KG, "mercearia", "9.90"),
    _product("Feijão carioca", "Vale Verde", "1", KG, BASE_KG, "mercearia", "9.49"),
    _product("Feijão preto", "Vale Verde", "1", KG, BASE_KG, "mercearia", "8.99"),
    _product("Lentilha", "Vale Verde", "500", G, BASE_KG, "mercearia", "17.80"),
    _product("Grão-de-bico", "Vale Verde", "500", G, BASE_KG, "mercearia", "23.80"),
    _product("Macarrão espaguete", "Dona Farinha", "500", G, BASE_KG, "mercearia", "9.80"),
    _product("Macarrão parafuso", "Dona Farinha", "500", G, BASE_KG, "mercearia", "9.80"),
    _product("Farinha de trigo", "Dona Farinha", "1", KG, BASE_KG, "mercearia", "6.29"),
    _product("Farinha de mandioca", "Dona Farinha", "500", G, BASE_KG, "mercearia", "11.80"),
    _product("Fubá", "Dona Farinha", "500", G, BASE_KG, "mercearia", "7.80"),
    _product("Aveia em flocos", "Manhã Boa", "500", G, BASE_KG, "mercearia", "15.80"),
    _product("Granola tradicional", "Manhã Boa", "500", G, BASE_KG, "mercearia", "27.80"),
    _product("Açúcar cristal", "Doce Cerrado", "1", KG, BASE_KG, "mercearia", "4.79"),
    _product("Açúcar mascavo", "Doce Cerrado", "500", G, BASE_KG, "mercearia", "15.80"),
    _product("Sal refinado", "Doce Cerrado", "1", KG, BASE_KG, "mercearia", "2.49"),
    _product("Óleo de soja", "Boa Colheita", "900", ML, BASE_L, "mercearia", "8.77"),
    _product(
        "Azeite de oliva extravirgem", "Oliva Serena",
        "500", ML, BASE_L, "mercearia", "69.80",
    ),
    _product("Vinagre de maçã", "Oliva Serena", "750", ML, BASE_L, "mercearia", "9.20"),
    _product("Molho de tomate", "Horta Rubra", "340", G, BASE_KG, "mercearia", "9.70"),
    _product("Extrato de tomate", "Horta Rubra", "340", G, BASE_KG, "mercearia", "13.20"),
    _product("Milho verde em conserva", "Horta Rubra", "170", G, BASE_KG, "mercearia", "24.10"),
    _product("Ervilha em conserva", "Horta Rubra", "170", G, BASE_KG, "mercearia", "23.50"),
    _product("Atum ralado em óleo", "Mar Sereno", "170", G, BASE_KG, "mercearia", "58.80"),
    _product("Sardinha em óleo", "Mar Sereno", "125", G, BASE_KG, "mercearia", "47.20"),
    _product("Café torrado e moído", "Serra Alta", "500", G, BASE_KG, "mercearia", "39.80"),
    _product("Achocolatado em pó", "Doce Cerrado", "400", G, BASE_KG, "mercearia", "24.75"),
    _product("Leite condensado", "Vale Leiteiro", "395", G, BASE_KG, "mercearia", "22.50"),
    _product("Creme de leite em lata", "Vale Leiteiro", "200", G, BASE_KG, "mercearia", "19.50"),
    _product("Biscoito integral", "Manhã Boa", "200", G, BASE_KG, "mercearia", "29.50"),
    _product("Pão de forma integral", "Manhã Boa", "500", G, BASE_KG, "mercearia", "19.80"),
    _product("Mel puro", "Flor do Cerrado", "300", G, BASE_KG, "mercearia", "66.30"),
    _product("Amendoim cru", "Flor do Cerrado", "500", G, BASE_KG, "mercearia", "21.80"),
    _product("Castanha-do-pará", "Flor do Cerrado", "200", G, BASE_KG, "mercearia", "139.50"),
    _product(
        "Pasta de amendoim integral", "Flor do Cerrado",
        "450", G, BASE_KG, "mercearia", "48.70",
    ),
]

_HORTIFRUTI = [
    _product("Banana prata", None, None, None, BASE_KG, "hortifruti", "7.90"),
    _product("Banana nanica", None, None, None, BASE_KG, "hortifruti", "6.90"),
    _product("Maçã gala", None, None, None, BASE_KG, "hortifruti", "11.90"),
    _product("Mamão papaia", None, None, None, BASE_KG, "hortifruti", "8.90"),
    _product("Laranja pera", None, None, None, BASE_KG, "hortifruti", "5.90"),
    _product("Limão taiti", None, None, None, BASE_KG, "hortifruti", "6.90"),
    _product("Melancia", None, None, None, BASE_KG, "hortifruti", "3.90"),
    _product("Manga tommy", None, None, None, BASE_KG, "hortifruti", "7.90"),
    _product("Uva itália", None, None, None, BASE_KG, "hortifruti", "16.90"),
    _product("Abacate", None, None, None, BASE_KG, "hortifruti", "9.90"),
    _product("Abacaxi pérola", None, None, None, BASE_UN, "hortifruti", "8.90"),
    _product("Morango bandeja", None, "300", G, BASE_KG, "hortifruti", "43.00"),
    _product("Tomate italiano", None, None, None, BASE_KG, "hortifruti", "9.90"),
    _product("Cebola branca", None, None, None, BASE_KG, "hortifruti", "6.90"),
    _product("Alho nacional", None, None, None, BASE_KG, "hortifruti", "39.90"),
    _product("Batata inglesa", None, None, None, BASE_KG, "hortifruti", "6.50"),
    _product("Batata doce", None, None, None, BASE_KG, "hortifruti", "5.90"),
    _product("Cenoura", None, None, None, BASE_KG, "hortifruti", "6.90"),
    _product("Beterraba", None, None, None, BASE_KG, "hortifruti", "6.50"),
    _product("Abobrinha italiana", None, None, None, BASE_KG, "hortifruti", "7.90"),
    _product("Chuchu", None, None, None, BASE_KG, "hortifruti", "4.90"),
    _product("Berinjela", None, None, None, BASE_KG, "hortifruti", "8.90"),
    _product("Pimentão verde", None, None, None, BASE_KG, "hortifruti", "9.90"),
    _product("Abóbora cabotiá", None, None, None, BASE_KG, "hortifruti", "5.90"),
    _product("Brócolis ninja", None, None, None, BASE_UN, "hortifruti", "8.90"),
    _product("Couve-flor", None, None, None, BASE_UN, "hortifruti", "9.90"),
    _product("Alface crespa", None, None, None, BASE_UN, "hortifruti", "4.50"),
    _product("Couve manteiga", None, None, None, BASE_UN, "hortifruti", "4.90"),
    _product("Rúcula", None, None, None, BASE_UN, "hortifruti", "4.90"),
    _product("Repolho verde", None, None, None, BASE_KG, "hortifruti", "4.50"),
]

_PROTEINAS = [
    _product("Peito de frango sem pele", None, None, None, BASE_KG, "proteinas", "21.90"),
    _product("Coxa e sobrecoxa de frango", None, None, None, BASE_KG, "proteinas", "14.90"),
    _product(
        "Frango inteiro congelado", "Granja Boa Ave",
        None, None, BASE_KG, "proteinas", "13.90",
    ),
    _product("Filé de peito de frango em cubos", None, None, None, BASE_KG, "proteinas", "24.90"),
    _product("Patinho moído", None, None, None, BASE_KG, "proteinas", "44.90"),
    _product("Acém em cubos", None, None, None, BASE_KG, "proteinas", "39.90"),
    _product("Alcatra em bifes", None, None, None, BASE_KG, "proteinas", "59.90"),
    _product("Coxão mole", None, None, None, BASE_KG, "proteinas", "49.90"),
    _product("Contrafilé", None, None, None, BASE_KG, "proteinas", "57.90"),
    _product("Músculo bovino", None, None, None, BASE_KG, "proteinas", "34.90"),
    _product("Costela bovina", None, None, None, BASE_KG, "proteinas", "32.90"),
    _product("Lombo suíno", None, None, None, BASE_KG, "proteinas", "27.90"),
    _product("Pernil suíno", None, None, None, BASE_KG, "proteinas", "24.90"),
    _product("Linguiça toscana", "Granja Boa Ave", None, None, BASE_KG, "proteinas", "26.90"),
    _product("Bacon em cubos", "Granja Boa Ave", "250", G, BASE_KG, "proteinas", "47.60"),
    _product("Presunto cozido fatiado", "Granja Boa Ave", "200", G, BASE_KG, "proteinas", "44.50"),
    _product("Peito de peru fatiado", "Granja Boa Ave", "200", G, BASE_KG, "proteinas", "59.50"),
    _product("Filé de tilápia", "Mar Sereno", None, None, BASE_KG, "proteinas", "49.90"),
    _product("Filé de merluza congelado", "Mar Sereno", None, None, BASE_KG, "proteinas", "37.90"),
    _product("Salmão em posta", "Mar Sereno", None, None, BASE_KG, "proteinas", "109.90"),
    _product("Camarão limpo congelado", "Mar Sereno", "500", G, BASE_KG, "proteinas", "89.80"),
    _product("Ovos de galinha", "Granja Boa Ave", "12", UN, BASE_UN, "proteinas", "1.05"),
    _product(
        "Ovos de codorna em conserva", "Granja Boa Ave",
        "12", UN, BASE_UN, "proteinas", "0.90",
    ),
    _product("Proteína de soja texturizada", "Vale Verde", "400", G, BASE_KG, "proteinas", "19.75"),
    _product("Tofu firme", "Vale Verde", "350", G, BASE_KG, "proteinas", "34.20"),
]

_LATICINIOS = [
    _product("Leite integral UHT", "Vale Leiteiro", "1", L, BASE_L, "laticinios", "5.49"),
    _product("Leite desnatado UHT", "Vale Leiteiro", "1", L, BASE_L, "laticinios", "5.29"),
    _product("Leite semidesnatado UHT", "Vale Leiteiro", "1", L, BASE_L, "laticinios", "5.39"),
    _product("Leite sem lactose UHT", "Vale Leiteiro", "1", L, BASE_L, "laticinios", "7.19"),
    _product("Leite em pó integral", "Vale Leiteiro", "400", G, BASE_KG, "laticinios", "39.90"),
    _product(
        "Iogurte natural integral", "Fazenda Aurora",
        "170", G, BASE_KG, "laticinios", "22.90",
    ),
    _product(
        "Iogurte natural desnatado", "Fazenda Aurora",
        "170", G, BASE_KG, "laticinios", "21.90",
    ),
    _product("Iogurte grego", "Fazenda Aurora", "100", G, BASE_KG, "laticinios", "42.00"),
    _product("Iogurte com frutas", "Fazenda Aurora", "540", G, BASE_KG, "laticinios", "16.90"),
    _product("Iogurte proteico", "Fazenda Aurora", "250", G, BASE_KG, "laticinios", "39.90"),
    _product("Bebida láctea fermentada", "Fazenda Aurora", "900", ML, BASE_L, "laticinios", "9.90"),
    _product("Leite fermentado", "Fazenda Aurora", "480", G, BASE_KG, "laticinios", "24.00"),
    _product("Kefir natural", "Fazenda Aurora", "1", L, BASE_L, "laticinios", "18.90"),
    _product("Queijo mussarela fatiado", "Serra Branca", "400", G, BASE_KG, "laticinios", "44.90"),
    _product("Queijo prato fatiado", "Serra Branca", "400", G, BASE_KG, "laticinios", "46.90"),
    _product("Queijo minas frescal", "Serra Branca", "500", G, BASE_KG, "laticinios", "39.90"),
    _product("Queijo coalho", "Serra Branca", "400", G, BASE_KG, "laticinios", "49.90"),
    _product("Queijo parmesão ralado", "Serra Branca", "50", G, BASE_KG, "laticinios", "89.90"),
    _product("Queijo gorgonzola", "Serra Branca", "100", G, BASE_KG, "laticinios", "119.90"),
    _product("Queijo processado fatiado", "Serra Branca", "144", G, BASE_KG, "laticinios", "59.90"),
    _product("Requeijão cremoso", "Serra Branca", "200", G, BASE_KG, "laticinios", "34.90"),
    _product("Cream cheese", "Serra Branca", "150", G, BASE_KG, "laticinios", "59.90"),
    _product("Ricota fresca", "Serra Branca", "400", G, BASE_KG, "laticinios", "29.90"),
    _product("Queijo cottage", "Serra Branca", "200", G, BASE_KG, "laticinios", "39.90"),
    _product("Manteiga com sal", "Fazenda Aurora", "200", G, BASE_KG, "laticinios", "69.90"),
    _product("Manteiga sem sal", "Fazenda Aurora", "200", G, BASE_KG, "laticinios", "71.90"),
    _product("Margarina cremosa", "Boa Colheita", "500", G, BASE_KG, "laticinios", "19.90"),
    _product("Creme de leite fresco", "Fazenda Aurora", "200", ML, BASE_L, "laticinios", "39.50"),
    _product("Nata", "Fazenda Aurora", "300", G, BASE_KG, "laticinios", "45.00"),
    _product("Doce de leite", "Doce Cerrado", "400", G, BASE_KG, "laticinios", "27.90"),
]

PRODUCTS: tuple[ProductSeed, ...] = tuple(_MERCEARIA + _HORTIFRUTI + _PROTEINAS + _LATICINIOS)

# Se alguém mexer nas listas acima, estas contas quebram o import na hora, em
# vez de gerar um seed silenciosamente diferente do documentado.
assert len(_MERCEARIA) == 35, len(_MERCEARIA)
assert len(_HORTIFRUTI) == 30, len(_HORTIFRUTI)
assert len(_PROTEINAS) == 25, len(_PROTEINAS)
assert len(_LATICINIOS) == 30, len(_LATICINIOS)
assert len(PRODUCTS) == 120, len(PRODUCTS)
