"""A guarda que impede carregar dado fictício fora de desenvolvimento."""

import pytest

from app.core.config import Settings
from app.seeds import runner
from app.seeds.runner import SeedNotAllowedError, ensure_development_environment


def test_permite_rodar_em_desenvolvimento(monkeypatch):
    monkeypatch.setattr(runner, "get_settings", lambda: Settings(app_env="dev"))
    ensure_development_environment()  # não levanta


@pytest.mark.parametrize("ambiente", ["prod", "producao", "homolog", ""])
def test_recusa_rodar_fora_de_desenvolvimento(monkeypatch, ambiente):
    # Regra do projeto: preço inventado nunca pode existir em produção.
    monkeypatch.setattr(runner, "get_settings", lambda: Settings(app_env=ambiente))

    with pytest.raises(SeedNotAllowedError) as erro:
        ensure_development_environment()

    assert ambiente in str(erro.value)
