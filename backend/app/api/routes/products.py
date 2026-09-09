"""Busca no catálogo de produtos."""

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models import Product
from app.schemas.pantry import ProductSuggestionOut
from app.services.matching import rank_products

router = APIRouter(prefix="/products", tags=["catálogo"])


@router.get("/search", response_model=list[ProductSuggestionOut])
def search_products(
    session: DbSession,
    user: CurrentUser,
    q: str = Query(min_length=2, max_length=200, description="Texto digitado pelo usuário"),
    limit: int = Query(default=5, ge=1, le=20),
) -> list:
    """Produtos parecidos com o texto, do mais parecido ao menos.

    Existe para o usuário poder escolher o produto na hora de guardar algo na
    despensa: item sem produto do catálogo não abate da lista de compras nem
    conta para as receitas.

    Só ordena por semelhança de nome — quem escolhe continua sendo o usuário.
    """
    catalog = session.scalars(select(Product)).all()
    return rank_products(q, catalog, limit)
