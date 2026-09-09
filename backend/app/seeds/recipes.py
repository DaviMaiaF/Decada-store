"""Receitas fictícias de desenvolvimento.

Preparos simples do dia a dia brasileiro, montados só com produtos que existem
no catálogo de desenvolvimento. Os ingredientes apontam para o produto pelo
nome, que é a chave natural do catálogo — o slug depende de marca e gramatura e
não serve para referenciar aqui.

**Todas são fictícias.** Entram no banco com `is_fictitious = true`, junto com o
resto do seed, e não devem existir em produção.

Cuidado ao editar: a unidade de cada ingrediente precisa ser da mesma grandeza
que a unidade base do produto — grama para produto vendido por quilo, mililitro
para produto vendido por litro, unidade para produto vendido por unidade. O
teste `test_recipes.py` verifica isso em todas as receitas.
"""

from dataclasses import dataclass

from app.models.enums import MeasurementUnit

G = MeasurementUnit.GRAMA
ML = MeasurementUnit.MILILITRO
UN = MeasurementUnit.UNIDADE


@dataclass(frozen=True)
class IngredientSeed:
    # Nome exato do produto no catálogo.
    product_name: str
    quantity: str
    unit: MeasurementUnit
    # Ingrediente opcional não impede a receita de ser sugerida.
    optional: bool = False


@dataclass(frozen=True)
class RecipeSeed:
    slug: str
    name: str
    servings: int
    prep_minutes: int
    instructions: str
    ingredients: tuple[IngredientSeed, ...]


RECIPES: tuple[RecipeSeed, ...] = (
    RecipeSeed(
        slug="panqueca-de-aveia-e-banana",
        name="Panqueca de aveia e banana",
        servings=2,
        prep_minutes=10,
        instructions=(
            "Amasse a banana até virar purê. Misture com os ovos e a aveia até "
            "a massa ficar homogênea. Doure dos dois lados em frigideira "
            "antiaderente, em fogo médio."
        ),
        ingredients=(
            IngredientSeed("Aveia em flocos", "60", G),
            IngredientSeed("Banana prata", "200", G),
            IngredientSeed("Ovos de galinha", "2", UN),
        ),
    ),
    RecipeSeed(
        slug="omelete-de-queijo-minas-e-tomate",
        name="Omelete de queijo minas e tomate",
        servings=1,
        prep_minutes=10,
        instructions=(
            "Bata os ovos com uma pitada de sal. Despeje na frigideira quente "
            "com o azeite, espalhe o queijo e o tomate picado e dobre ao meio "
            "quando o centro ainda estiver cremoso."
        ),
        ingredients=(
            IngredientSeed("Ovos de galinha", "3", UN),
            IngredientSeed("Queijo minas frescal", "60", G),
            IngredientSeed("Tomate italiano", "100", G),
            IngredientSeed("Azeite de oliva extravirgem", "5", ML, optional=True),
        ),
    ),
    RecipeSeed(
        slug="bowl-de-iogurte-com-banana-e-aveia",
        name="Bowl de iogurte com banana e aveia",
        servings=1,
        prep_minutes=5,
        instructions=(
            "Corte a banana em rodelas. Cubra com o iogurte, salpique a aveia "
            "por cima e finalize com o mel, se quiser."
        ),
        ingredients=(
            IngredientSeed("Iogurte natural integral", "170", G),
            IngredientSeed("Banana prata", "120", G),
            IngredientSeed("Aveia em flocos", "30", G),
            IngredientSeed("Mel puro", "15", G, optional=True),
        ),
    ),
    RecipeSeed(
        slug="vitamina-de-mamao-com-aveia",
        name="Vitamina de mamão com aveia",
        servings=1,
        prep_minutes=5,
        instructions="Bata o mamão com o leite e a aveia até ficar liso. Sirva gelado.",
        ingredients=(
            IngredientSeed("Mamão papaia", "200", G),
            IngredientSeed("Leite integral UHT", "200", ML),
            IngredientSeed("Aveia em flocos", "30", G),
        ),
    ),
    RecipeSeed(
        slug="arroz-com-feijao-e-frango-grelhado",
        name="Arroz com feijão e frango grelhado",
        servings=2,
        prep_minutes=40,
        instructions=(
            "Refogue o alho e a cebola, junte o arroz e cozinhe. Aqueça o feijão "
            "à parte. Grelhe o frango temperado até dourar dos dois lados."
        ),
        ingredients=(
            IngredientSeed("Arroz integral", "200", G),
            IngredientSeed("Feijão carioca", "200", G),
            IngredientSeed("Peito de frango sem pele", "300", G),
            IngredientSeed("Cebola branca", "50", G),
            IngredientSeed("Alho nacional", "10", G),
        ),
    ),
    RecipeSeed(
        slug="macarrao-ao-sugo-com-frango",
        name="Macarrão ao sugo com frango",
        servings=3,
        prep_minutes=30,
        instructions=(
            "Cozinhe o macarrão al dente. Doure o frango em cubos com o alho, "
            "junte o molho de tomate e deixe apurar. Misture tudo antes de servir."
        ),
        ingredients=(
            IngredientSeed("Macarrão espaguete", "250", G),
            IngredientSeed("Molho de tomate", "340", G),
            IngredientSeed("Filé de peito de frango em cubos", "300", G),
            IngredientSeed("Alho nacional", "10", G),
            IngredientSeed("Queijo parmesão ralado", "30", G, optional=True),
        ),
    ),
    RecipeSeed(
        slug="escondidinho-de-batata-doce",
        name="Escondidinho de batata doce com carne moída",
        servings=4,
        prep_minutes=50,
        instructions=(
            "Cozinhe a batata doce e amasse com a manteiga. Refogue a carne com "
            "cebola e alho. Monte em camadas e leve ao forno até gratinar."
        ),
        ingredients=(
            IngredientSeed("Batata doce", "600", G),
            IngredientSeed("Patinho moído", "400", G),
            IngredientSeed("Cebola branca", "80", G),
            IngredientSeed("Alho nacional", "10", G),
            IngredientSeed("Manteiga com sal", "20", G),
        ),
    ),
    RecipeSeed(
        slug="sopa-de-legumes-com-musculo",
        name="Sopa de legumes com músculo",
        servings=4,
        prep_minutes=60,
        instructions=(
            "Cozinhe o músculo até ficar macio. Junte os legumes em cubos e "
            "deixe apurar até engrossar o caldo."
        ),
        ingredients=(
            IngredientSeed("Músculo bovino", "400", G),
            IngredientSeed("Cenoura", "200", G),
            IngredientSeed("Batata inglesa", "300", G),
            IngredientSeed("Chuchu", "200", G),
            IngredientSeed("Cebola branca", "80", G),
        ),
    ),
    RecipeSeed(
        slug="salada-de-grao-de-bico-com-atum",
        name="Salada de grão-de-bico com atum",
        servings=2,
        prep_minutes=15,
        instructions=(
            "Escorra o grão-de-bico já cozido e o atum. Misture com o tomate e a "
            "cebola picados e tempere com o azeite."
        ),
        ingredients=(
            IngredientSeed("Grão-de-bico", "200", G),
            IngredientSeed("Atum ralado em óleo", "170", G),
            IngredientSeed("Tomate italiano", "150", G),
            IngredientSeed("Cebola branca", "50", G),
            IngredientSeed("Azeite de oliva extravirgem", "15", ML, optional=True),
        ),
    ),
    RecipeSeed(
        slug="omelete-de-forno-com-brocolis",
        name="Omelete de forno com brócolis",
        servings=2,
        prep_minutes=35,
        instructions=(
            "Cozinhe o brócolis no vapor. Bata os ovos, misture o brócolis e o "
            "queijo e asse em forma untada até firmar."
        ),
        ingredients=(
            IngredientSeed("Ovos de galinha", "4", UN),
            IngredientSeed("Brócolis ninja", "1", UN),
            IngredientSeed("Queijo mussarela fatiado", "80", G),
        ),
    ),
)
