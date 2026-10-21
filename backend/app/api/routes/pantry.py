"""Rotas da despensa: o que a pessoa já tem em casa."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentPatient, DbSession
from app.core.config import get_settings
from app.models import PantryItem, Product
from app.schemas.pantry import (
    PantryItemIn,
    PantryItemOut,
    PantryItemUpdate,
    PhotoRecognitionOut,
    ProductSuggestionOut,
)
from app.services.pantry import ensure_measurable, suggest_products, user_pantry
from app.services.pantry_photo import (
    MAX_UPLOAD_BYTES,
    FoodRecognizer,
    build_recognizer,
    recognize_photo,
)
from app.services.text import normalize_text

router = APIRouter(prefix="/pantry", tags=["despensa"])


def _get_item(session: DbSession, user: CurrentPatient, item_id: uuid.UUID) -> PantryItem:
    item = session.scalars(
        select(PantryItem)
        .where(PantryItem.id == item_id, PantryItem.user_id == user.id)
        .options(selectinload(PantryItem.product))
    ).first()

    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "item não encontrado na sua despensa")
    return item


def _get_product(session: DbSession, product_id: uuid.UUID | None) -> Product | None:
    """O produto informado, ou 404 se ele não existe. Nulo é item sem vínculo."""
    if product_id is None:
        return None

    product = session.get(Product, product_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "produto não encontrado")
    return product


def get_food_recognizer() -> FoodRecognizer:
    """O reconhecedor da foto. Os testes trocam este por um falso."""
    settings = get_settings()
    return build_recognizer(settings.anthropic_api_key, settings.vision_model)


@router.get("", response_model=list[PantryItemOut])
def read_pantry(session: DbSession, user: CurrentPatient) -> list[PantryItem]:
    """A despensa do usuário, do item mais recente ao mais antigo."""
    return user_pantry(session, user.id)


@router.post("", response_model=PantryItemOut, status_code=status.HTTP_201_CREATED)
def add_pantry_item(
    session: DbSession, user: CurrentPatient, payload: PantryItemIn
) -> PantryItem:
    """Guarda um item na despensa.

    Aceita item só com texto: enquanto não houver produto do catálogo
    confirmado, o item aparece na despensa mas não abate nada da compra.
    """
    ensure_measurable(_get_product(session, payload.product_id), payload.unit)

    item = PantryItem(
        user_id=user.id,
        raw_description=payload.raw_description,
        normalized_description=normalize_text(payload.raw_description),
        product_id=payload.product_id,
        quantity=payload.quantity,
        unit=payload.unit,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.post("/photo", response_model=PhotoRecognitionOut)
def recognize_pantry_photo(
    session: DbSession,
    user: CurrentPatient,
    file: Annotated[UploadFile, File(description="Foto do que se tem em casa: JPEG, PNG ou WebP")],
    consent_accepted: Annotated[
        bool,
        Form(description="Aceite do envio da foto ao serviço de reconhecimento (LGPD)"),
    ],
    recognizer: Annotated[FoodRecognizer, Depends(get_food_recognizer)],
) -> PhotoRecognitionOut:
    """Diz que alimentos a foto mostra e quais produtos do catálogo podem ser.

    **Não grava nada.** É proposta: o que a pessoa confirmar entra pelo
    `POST /pantry`, item a item (decisão 11). A foto é lida em memória, reduzida,
    enviada ao reconhecimento e descartada — não fica em disco, banco nem log.

    O aceite vem antes de tudo porque a foto sai do servidor para um serviço de
    terceiros: sem ele, nem o arquivo é lido.
    """
    if not consent_accepted:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "sem aceite do termo a foto não é enviada ao reconhecimento",
        )

    # Lê um byte além do limite: é o que basta para saber que passou, sem
    # carregar na memória um arquivo de qualquer tamanho.
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    catalog = session.scalars(select(Product)).all()
    proposals = recognize_photo(data, recognizer, catalog)
    return PhotoRecognitionOut.model_validate({"items": proposals}, from_attributes=True)


@router.patch("/{item_id}", response_model=PantryItemOut)
def update_pantry_item(
    session: DbSession,
    user: CurrentPatient,
    item_id: uuid.UUID,
    payload: PantryItemUpdate,
) -> PantryItem:
    """Vincula o produto ou informa a medição de um item que já está na despensa.

    É o caminho de volta para o item cadastrado pela metade. Só os campos
    enviados mudam, então mandar `product_id` sozinho preserva a medição — e
    `null` nos dois campos de medida é como se apaga uma medição que havia.
    """
    item = _get_item(session, user, item_id)
    data = payload.model_dump(exclude_unset=True)

    # A validação é sobre o item como ele vai ficar, não sobre o que veio no
    # corpo: trocar só o produto pode deixar a medição antiga em outra grandeza.
    product = _get_product(session, data.get("product_id", item.product_id))
    ensure_measurable(product, data.get("unit", item.unit))

    for field, value in data.items():
        setattr(item, field, value)

    session.commit()
    # Recarrega junto com o produto: a resposta devolve o vínculo, não só o id.
    return _get_item(session, user, item_id)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_pantry_item(session: DbSession, user: CurrentPatient, item_id: uuid.UUID) -> Response:
    """Tira um item da despensa."""
    session.delete(_get_item(session, user, item_id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{item_id}/candidates", response_model=list[ProductSuggestionOut])
def read_pantry_candidates(
    session: DbSession, user: CurrentPatient, item_id: uuid.UUID
) -> list:
    """Produtos do catálogo parecidos com o que a pessoa digitou.

    Só sugere: enquanto o usuário não confirmar, `product_id` continua nulo e o
    item não abate nada da lista de compras.
    """
    return suggest_products(session, _get_item(session, user, item_id))
