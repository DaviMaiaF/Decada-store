"""Testes da conversão de unidades."""

from decimal import Decimal

import pytest

from app.models.enums import BaseUnit, MeasurementUnit
from app.services.units import (
    IncompatibleUnitError,
    base_unit_of,
    measurement_unit_of,
    to_base_quantity,
)


@pytest.mark.parametrize(
    ("unit", "esperado"),
    [
        (MeasurementUnit.GRAMA, BaseUnit.QUILOGRAMA),
        (MeasurementUnit.QUILOGRAMA, BaseUnit.QUILOGRAMA),
        (MeasurementUnit.MILILITRO, BaseUnit.LITRO),
        (MeasurementUnit.LITRO, BaseUnit.LITRO),
        (MeasurementUnit.UNIDADE, BaseUnit.UNIDADE),
    ],
)
def test_cada_unidade_pertence_a_uma_unidade_base(unit, esperado):
    assert base_unit_of(unit) is esperado


@pytest.mark.parametrize(
    ("quantity", "unit", "base_unit", "esperado"),
    [
        ("500", MeasurementUnit.GRAMA, BaseUnit.QUILOGRAMA, "0.5"),
        ("1200", MeasurementUnit.GRAMA, BaseUnit.QUILOGRAMA, "1.2"),
        ("2", MeasurementUnit.QUILOGRAMA, BaseUnit.QUILOGRAMA, "2"),
        ("900", MeasurementUnit.MILILITRO, BaseUnit.LITRO, "0.9"),
        ("1", MeasurementUnit.LITRO, BaseUnit.LITRO, "1"),
        ("12", MeasurementUnit.UNIDADE, BaseUnit.UNIDADE, "12"),
    ],
)
def test_converte_para_a_unidade_base(quantity, unit, base_unit, esperado):
    convertido = to_base_quantity(Decimal(quantity), unit, base_unit)
    assert convertido == Decimal(esperado)


def test_converter_entre_grandezas_diferentes_e_erro():
    # Silenciar isso geraria preço por litro de um produto vendido em grama.
    with pytest.raises(IncompatibleUnitError):
        to_base_quantity(Decimal("500"), MeasurementUnit.GRAMA, BaseUnit.LITRO)


def test_caminho_inverso_da_unidade_base():
    assert measurement_unit_of(BaseUnit.QUILOGRAMA) is MeasurementUnit.QUILOGRAMA
    assert measurement_unit_of(BaseUnit.UNIDADE) is MeasurementUnit.UNIDADE
