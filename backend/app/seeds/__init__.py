"""Carga de dados fictícios para desenvolvimento."""

from app.seeds.runner import SeedNotAllowedError, SeedSummary, ensure_seed_allowed, run

__all__ = ["SeedNotAllowedError", "SeedSummary", "ensure_seed_allowed", "run"]
