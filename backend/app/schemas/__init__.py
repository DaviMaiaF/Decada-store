"""Schemas Pydantic: o contrato de entrada e saída da API.

Separados dos modelos SQLAlchemy de propósito. O que o banco guarda e o que a
API expõe mudam por motivos diferentes, e misturar os dois faria uma coluna
nova vazar para o contrato sem ninguém decidir.
"""
