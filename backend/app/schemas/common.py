"""Schemas usados por mais de um recurso."""

import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.enums import BaseUnit, MeasurementUnit


class ApiModel(BaseModel):
    """Base dos schemas de saída: lê direto dos objetos do SQLAlchemy."""

    model_config = ConfigDict(from_attributes=True)


class ProductOut(ApiModel):
    """Produto do catálogo, como a API o expõe."""

    id: uuid.UUID
    name: str
    brand: str | None = None
    # Corredor do mercado: hortifruti, proteinas, laticinios, mercearia.
    category: str | None = None
    base_unit: BaseUnit
    package_size: Decimal | None = None
    package_unit: MeasurementUnit | None = None
    # Marca dado fictício de desenvolvimento. A interface precisa poder avisar.
    is_fictitious: bool
