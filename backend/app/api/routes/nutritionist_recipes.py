"""Receitas da nutricionista: criar, ler, editar e excluir as próprias."""

import uuid

from fastapi import APIRouter, HTTPException, Response, status

from app.api.deps import CurrentNutritionist, DbSession
from app.models import Recipe
from app.schemas.recipe import RecipeIn, RecipeOut
from app.services.recipe_authoring import (
    create_recipe,
    get_own_recipe,
    own_recipes,
    update_recipe,
)

router = APIRouter(prefix="/nutritionist/recipes", tags=["receitas da nutricionista"])


def _get_recipe(session: DbSession, user: CurrentNutritionist, recipe_id: uuid.UUID) -> Recipe:
    """Receita da nutricionista, ou 404.

    Receita de outra nutricionista ou do seed também devolve 404 (decisão 10).
    As de outras ela vê nas sugestões como qualquer paciente, mas não edita.
    """
    recipe = get_own_recipe(session, user, recipe_id)
    if recipe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "receita não encontrada")
    return recipe


@router.get("", response_model=list[RecipeOut])
def read_recipes(session: DbSession, user: CurrentNutritionist) -> list[Recipe]:
    """As receitas que esta nutricionista escreveu."""
    return own_recipes(session, user)


@router.post("", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def add_recipe(session: DbSession, user: CurrentNutritionist, payload: RecipeIn) -> Recipe:
    """Publica uma receita. Ela passa a aparecer nas sugestões de todo paciente."""
    return create_recipe(session, user, payload)


@router.get("/{recipe_id}", response_model=RecipeOut)
def read_recipe(session: DbSession, user: CurrentNutritionist, recipe_id: uuid.UUID) -> Recipe:
    return _get_recipe(session, user, recipe_id)


@router.put("/{recipe_id}", response_model=RecipeOut)
def replace_recipe(
    session: DbSession, user: CurrentNutritionist, recipe_id: uuid.UUID, payload: RecipeIn
) -> Recipe:
    """Troca a receita inteira, ingredientes inclusive."""
    return update_recipe(session, _get_recipe(session, user, recipe_id), payload)


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_recipe(session: DbSession, user: CurrentNutritionist, recipe_id: uuid.UUID) -> Response:
    """Apaga a receita de verdade. Nada no domínio guarda referência a ela."""
    session.delete(_get_recipe(session, user, recipe_id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
