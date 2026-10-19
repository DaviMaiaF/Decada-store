"""Enumerações do domínio.

Herdam de `str` para serializarem como texto legível no JSON e no banco
(Python 3.10 não tem `enum.StrEnum`).
"""

from enum import Enum


class MeasurementUnit(str, Enum):
    """Unidade em que uma quantidade foi expressa (plano, nota fiscal, receita)."""

    GRAMA = "g"
    QUILOGRAMA = "kg"
    MILILITRO = "ml"
    LITRO = "l"
    UNIDADE = "unidade"


class BaseUnit(str, Enum):
    """Unidade de normalização do preço de um produto: R$/kg, R$/l ou R$/unidade."""

    QUILOGRAMA = "kg"
    LITRO = "l"
    UNIDADE = "unidade"


class PriceOrigin(str, Enum):
    """De onde veio o registro de preço. `seed` identifica dado fictício."""

    NFCE = "nfce"
    SCRAPING = "scraping"
    USUARIO = "usuario"
    SEED = "seed"


class PlanItemStatus(str, Enum):
    """Situação do casamento de um item do plano com um produto do catálogo."""

    PENDENTE = "pendente"
    CONFIRMADO = "confirmado"
    NAO_IDENTIFICADO = "nao_identificado"


class PlanChange(str, Enum):
    """Por que um item do plano não bate mais com a lista já gerada.

    Não vira coluna: é calculado a cada leitura da lista, comparando o retrato
    dela com o plano de agora.
    """

    # O produto confirmado hoje não é o que a lista guardou.
    PRODUTO_TROCADO = "produto_trocado"
    # O item estava na lista, mas deixou de estar confirmado no plano.
    NAO_CONFIRMADO = "nao_confirmado"
    # Confirmado depois da geração: a lista não o conhece.
    NOVO_CONFIRMADO = "novo_confirmado"


class PriceConfidence(str, Enum):
    """Idade do preço usado: até 7 dias, até 30 dias, acima disso."""

    ATUAL = "atual"
    RECENTE = "recente"
    ESTIMATIVA = "estimativa"


class UserRole(str, Enum):
    """Papel da conta: quem segue um plano ou quem escreve receitas."""

    PACIENTE = "paciente"
    NUTRICIONISTA = "nutricionista"
