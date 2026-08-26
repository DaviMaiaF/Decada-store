"""Conversão entre unidades de medida.

A regra de negócio é sempre a mesma: preço só pode ser comparado depois de
convertido para a unidade base do produto (R$/kg, R$/l ou R$/unidade).
"""

from decimal import Decimal

from app.models.enums import BaseUnit, MeasurementUnit


class IncompatibleUnitError(ValueError):
    """Tentativa de converter entre grandezas diferentes, como grama e litro."""


# Para cada unidade: a qual unidade base ela pertence e por quanto multiplicar.
_TO_BASE: dict[MeasurementUnit, tuple[BaseUnit, Decimal]] = {
    MeasurementUnit.GRAMA: (BaseUnit.QUILOGRAMA, Decimal("0.001")),
    MeasurementUnit.QUILOGRAMA: (BaseUnit.QUILOGRAMA, Decimal("1")),
    MeasurementUnit.MILILITRO: (BaseUnit.LITRO, Decimal("0.001")),
    MeasurementUnit.LITRO: (BaseUnit.LITRO, Decimal("1")),
    MeasurementUnit.UNIDADE: (BaseUnit.UNIDADE, Decimal("1")),
}

_MEASUREMENT_OF_BASE: dict[BaseUnit, MeasurementUnit] = {
    BaseUnit.QUILOGRAMA: MeasurementUnit.QUILOGRAMA,
    BaseUnit.LITRO: MeasurementUnit.LITRO,
    BaseUnit.UNIDADE: MeasurementUnit.UNIDADE,
}


def base_unit_of(unit: MeasurementUnit) -> BaseUnit:
    """Unidade base correspondente: g e kg pertencem a kg; ml e l pertencem a l."""
    return _TO_BASE[unit][0]


def measurement_unit_of(base_unit: BaseUnit) -> MeasurementUnit:
    """Caminho inverso: a unidade de medida equivalente à unidade base."""
    return _MEASUREMENT_OF_BASE[base_unit]


def to_base_quantity(
    quantity: Decimal, unit: MeasurementUnit, base_unit: BaseUnit
) -> Decimal:
    """Converte uma quantidade para a unidade base do produto.

    500 g com base kg viram 0.5. Converter 500 g para litro é erro, não zero:
    silenciar isso produziria preço por litro de um produto vendido em grama.
    """
    origin_base, factor = _TO_BASE[unit]
    if origin_base is not base_unit:
        raise IncompatibleUnitError(
            f"não é possível converter {unit.value} para {base_unit.value}"
        )
    return quantity * factor
