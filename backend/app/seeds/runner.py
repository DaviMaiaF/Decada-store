"""Carga do catálogo fictício de desenvolvimento.

Idempotência: cada linha recebe um UUID determinístico (uuid5) derivado de uma
chave natural. Rodar o seed de novo escreve nos mesmos identificadores, então
não há duplicação — sem depender de constraint única, que `price_records` não
teria como oferecer (a chave da NFC-e é nula em dado de seed).
"""

import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Market, PriceRecord, Product, Recipe, RecipeIngredient, User
from app.models.enums import MeasurementUnit, PriceOrigin
from app.seeds.catalog import MARKETS, PRODUCTS, MarketSeed, ProductSeed
from app.seeds.recipes import RECIPES, RecipeSeed
from app.services.security import hash_password
from app.services.text import normalize_text, slugify
from app.services.units import measurement_unit_of, to_base_quantity

# Namespace fixo do projeto: muda-lo faria o seed gerar IDs novos e duplicar tudo.
SEED_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "seed.decada.local")

DEFAULT_RANDOM_SEED = 42

# Conta de desenvolvimento, para não precisar cadastrar uma a cada banco novo.
# Não é exceção na autenticação: é um usuário comum, com senha de verdade
# passando pelo mesmo bcrypt. O que a protege é a trava de ambiente do seed —
# ele se recusa a rodar se APP_ENV não for dev.
DEV_USER_EMAIL = "beta@example.com"
DEV_USER_PASSWORD = "decada-beta-2026"

# Idades das coletas, uma em cada faixa de confiança da etapa 4:
#   3 dias  -> "atual"      (até 7 dias)
#   18 dias -> "recente"    (até 30 dias)
#   45 dias -> "estimativa" (acima de 30 dias)
# Sem um registro velho o suficiente, a etapa 4 não teria como testar o caso
# de preço vencido com os dados do seed.
COLLECTION_DAYS_AGO: tuple[int, ...] = (3, 18, 45)

# Variação aleatória aplicada a cada coleta, para cima ou para baixo.
PRICE_NOISE = 0.04

CENTS = Decimal("0.01")
BASE_UNIT_PRECISION = Decimal("0.0001")


class SeedNotAllowedError(RuntimeError):
    """O seed foi disparado fora do ambiente de desenvolvimento."""


@dataclass(frozen=True)
class SeedSummary:
    """Quantidade de linhas existentes no banco ao fim da carga."""

    markets: int
    products: int
    price_records: int
    recipes: int


def ensure_development_environment() -> None:
    """Impede a carga fora de desenvolvimento.

    Regra do projeto: dado de preço fictício não pode existir em produção.
    """
    app_env = get_settings().app_env
    if app_env != "dev":
        raise SeedNotAllowedError(
            f"o seed só roda com APP_ENV=dev; o ambiente atual é '{app_env}'"
        )


def _market_id(market: MarketSeed) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, f"market|{market.slug}")


def _product_slug(product: ProductSeed) -> str:
    if product.package_size is None:
        size = "granel"
    else:
        size = f"{product.package_size:f}{product.package_unit.value}"
    return slugify(product.name, product.brand, size)


def _product_id(product: ProductSeed) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, f"product|{_product_slug(product)}")


def _recipe_id(recipe: RecipeSeed) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, f"recipe|{recipe.slug}")


def _recipe_ingredient_id(recipe: RecipeSeed, product_name: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, f"recipe_ingredient|{recipe.slug}|{product_name}")


def _price_id(product: ProductSeed, market: MarketSeed, index: int) -> uuid.UUID:
    return uuid.uuid5(
        SEED_NAMESPACE, f"price|{_product_slug(product)}|{market.slug}|{index}"
    )


def _load_markets(session: Session) -> None:
    for market in MARKETS:
        session.merge(
            Market(
                id=_market_id(market),
                name=market.name,
                cnpj=None,  # mercado fictício não tem CNPJ
                chain=market.chain,
                state_code=market.state_code,
                city=market.city,
                is_fictitious=True,
            )
        )


def _load_products(session: Session) -> None:
    for product in PRODUCTS:
        session.merge(
            Product(
                id=_product_id(product),
                slug=_product_slug(product),
                name=product.name,
                normalized_name=normalize_text(product.name),
                brand=product.brand,
                package_size=product.package_size,
                package_unit=product.package_unit,
                base_unit=product.base_unit,
                barcode=None,  # EAN identifica produto real; não se inventa
                category=product.category,
                is_fictitious=True,
            )
        )


def _load_price_records(session: Session, generator: random.Random) -> None:
    now = datetime.now(timezone.utc)

    for product in PRODUCTS:
        for market in MARKETS:
            for index, days_ago in enumerate(COLLECTION_DAYS_AGO):
                noise = Decimal(str(1 + generator.uniform(-PRICE_NOISE, PRICE_NOISE)))
                price_per_base_unit = (
                    product.base_price * market.price_factor * noise
                ).quantize(BASE_UNIT_PRECISION, rounding=ROUND_HALF_UP)

                if product.package_size is None:
                    # Vendido a granel: o preço do cupom já é o preço da unidade base.
                    unit = measurement_unit_of(product.base_unit)
                    unit_price = price_per_base_unit
                else:
                    # Vendido em embalagem fechada: o cupom traz o preço do pacote.
                    unit = MeasurementUnit.UNIDADE
                    quantity_in_base = to_base_quantity(
                        product.package_size, product.package_unit, product.base_unit
                    )
                    unit_price = price_per_base_unit * quantity_in_base

                session.merge(
                    PriceRecord(
                        id=_price_id(product, market, index),
                        product_id=_product_id(product),
                        market_id=_market_id(market),
                        user_id=None,
                        unit_price=unit_price.quantize(CENTS, rounding=ROUND_HALF_UP),
                        unit=unit,
                        price_per_base_unit=price_per_base_unit,
                        collected_at=now - timedelta(days=days_ago),
                        origin=PriceOrigin.SEED,
                        state_code=market.state_code,
                        city=market.city,
                        nfce_access_key=None,
                    )
                )


def _dev_user_id() -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, f"user|{DEV_USER_EMAIL}")


def _load_dev_user(session: Session) -> None:
    """Cria (ou atualiza) a conta de desenvolvimento.

    O hash é recalculado a cada carga, o que é lento de propósito no bcrypt e
    irrelevante aqui: são milissegundos, uma vez por execução do seed.
    """
    session.merge(
        User(
            id=_dev_user_id(),
            email=DEV_USER_EMAIL,
            password_hash=hash_password(DEV_USER_PASSWORD),
            full_name="Beta da Silva",
        )
    )


def _load_recipes(session: Session) -> None:
    """Carrega as receitas fictícias, ligando cada ingrediente ao produto do catálogo."""
    produtos_por_nome = {product.name: product for product in PRODUCTS}

    for recipe in RECIPES:
        session.merge(
            Recipe(
                id=_recipe_id(recipe),
                slug=recipe.slug,
                name=recipe.name,
                instructions=recipe.instructions,
                servings=recipe.servings,
                prep_minutes=recipe.prep_minutes,
                is_fictitious=True,
            )
        )

        for ingredient in recipe.ingredients:
            product = produtos_por_nome.get(ingredient.product_name)
            if product is None:
                # Receita apontando para produto que não existe no catálogo é
                # erro de edição, não dado faltando: falhar aqui é mais barato
                # que descobrir depois com a receita sugerida pela metade.
                raise ValueError(
                    f"receita '{recipe.slug}' cita produto inexistente: "
                    f"'{ingredient.product_name}'"
                )

            session.merge(
                RecipeIngredient(
                    id=_recipe_ingredient_id(recipe, ingredient.product_name),
                    recipe_id=_recipe_id(recipe),
                    product_id=_product_id(product),
                    quantity=Decimal(ingredient.quantity),
                    unit=ingredient.unit,
                    optional=ingredient.optional,
                )
            )


def _count(session: Session, model: type) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def run(session: Session, *, random_seed: int = DEFAULT_RANDOM_SEED) -> SeedSummary:
    """Carrega mercados, produtos, preços e receitas fictícios. Pode rodar quantas vezes quiser.

    O gerador é semeado com um valor fixo: os mesmos preços saem em toda
    execução, o que torna o resultado reproduzível numa apresentação.
    """
    generator = random.Random(random_seed)

    _load_markets(session)
    _load_products(session)
    session.flush()  # produtos e mercados precisam existir antes das chaves estrangeiras
    _load_price_records(session, generator)
    _load_recipes(session)
    _load_dev_user(session)
    session.commit()

    return SeedSummary(
        markets=_count(session, Market),
        products=_count(session, Product),
        price_records=_count(session, PriceRecord),
        recipes=_count(session, Recipe),
    )
