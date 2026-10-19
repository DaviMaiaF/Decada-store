"""Receitas escritas pela nutricionista.

O formato da receita (nome, ingredientes repetidos, só opcionais) é checado no
schema. Aqui fica o que depende do banco:
  - todo ingrediente aponta para um produto que existe no catálogo, porque é o
    produto que permite medir a disponibilidade (services/recipes.py);
  - a unidade do ingrediente é da grandeza em que o produto é vendido. "200 ml"
    de um produto vendido por quilo seria aceito pelo banco e deixaria o
    ingrediente faltando para sempre, sem ninguém entender por quê.

A receita não mexe em plano alimentar nenhum (decisões 4 e 8): ela entra nas
sugestões, que só olham para o que a pessoa já tem ou já vai comprar.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Product, Recipe, RecipeIngredient, User
from app.schemas.recipe import RecipeIn
from app.services.pantry import ensure_measurable
from app.services.text import slugify


class UnknownProductError(ValueError):
    """Ingrediente apontando para produto que não está no catálogo."""


def _new_slug(name: str) -> str:
    """Slug único sem consultar o banco.

    Duas nutricionistas podem escrever "Omelete de espinafre". O sufixo aleatório
    evita a colisão sem transformar o nome da receita em chave de nada.
    """
    return f"{slugify(name)[:240]}-{uuid.uuid4().hex[:8]}"


def _ingredients(session: Session, payload: RecipeIn) -> list[RecipeIngredient]:
    ids = [ingrediente.product_id for ingrediente in payload.ingredients]
    products = {
        product.id: product
        for product in session.scalars(select(Product).where(Product.id.in_(ids)))
    }

    ingredients = []
    for ingrediente in payload.ingredients:
        product = products.get(ingrediente.product_id)
        if product is None:
            raise UnknownProductError(f"produto {ingrediente.product_id} não está no catálogo")
        ensure_measurable(product, ingrediente.unit)
        ingredients.append(
            RecipeIngredient(
                product=product,
                quantity=ingrediente.quantity,
                unit=ingrediente.unit,
                optional=ingrediente.optional,
            )
        )
    return ingredients


def create_recipe(session: Session, author: User, payload: RecipeIn) -> Recipe:
    """Grava uma receita nova, assinada pela nutricionista."""
    recipe = Recipe(
        slug=_new_slug(payload.name),
        name=payload.name,
        instructions=payload.instructions,
        servings=payload.servings,
        prep_minutes=payload.prep_minutes,
        author=author,
        ingredients=_ingredients(session, payload),
    )
    session.add(recipe)
    session.commit()
    return get_own_recipe(session, author, recipe.id)


def update_recipe(session: Session, recipe: Recipe, payload: RecipeIn) -> Recipe:
    """Troca a receita inteira pelo que veio, ingredientes inclusive.

    O slug não muda: é identificador, não título.
    """
    # Valida antes de tocar na receita, para um ingrediente inválido não
    # deixar a receita pela metade na sessão.
    ingredients = _ingredients(session, payload)

    recipe.name = payload.name
    recipe.instructions = payload.instructions
    recipe.servings = payload.servings
    recipe.prep_minutes = payload.prep_minutes

    # Os antigos saem antes de os novos entrarem: na mesma descarga, o
    # Postgres veria o mesmo produto duas vezes na receita e recusaria pela
    # unicidade (recipe_id, product_id).
    recipe.ingredients.clear()
    session.flush()
    recipe.ingredients.extend(ingredients)

    session.commit()
    return get_own_recipe(session, recipe.author, recipe.id)


def own_recipes(session: Session, author: User) -> list[Recipe]:
    """Receitas da nutricionista, em ordem alfabética."""
    return list(
        session.scalars(
            select(Recipe)
            .where(Recipe.author_id == author.id)
            .options(
                selectinload(Recipe.author),
                selectinload(Recipe.ingredients).selectinload(RecipeIngredient.product),
            )
            .order_by(Recipe.name)
        )
    )


def get_own_recipe(session: Session, author: User, recipe_id: uuid.UUID) -> Recipe | None:
    """A receita, se for desta nutricionista. Do seed ou de outra, é nula."""
    return session.scalars(
        select(Recipe)
        .where(Recipe.id == recipe_id, Recipe.author_id == author.id)
        .options(
            selectinload(Recipe.author),
            selectinload(Recipe.ingredients).selectinload(RecipeIngredient.product),
        )
        .execution_options(populate_existing=True)
    ).first()
