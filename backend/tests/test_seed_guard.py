"""A guarda que impede carregar dado fictício fora de dev e demo."""

import pytest

from app.core.config import Settings
from app.seeds import runner
from app.seeds.runner import SeedNotAllowedError, dev_user_allowed, ensure_seed_allowed


@pytest.mark.parametrize("ambiente", ["dev", "demo"])
def test_permite_rodar_em_dev_e_demo(monkeypatch, ambiente):
    monkeypatch.setattr(
        runner, "get_settings", lambda: Settings(app_env=ambiente, secret_key="x" * 48)
    )
    ensure_seed_allowed()  # não levanta


@pytest.mark.parametrize("ambiente", ["prod", "producao", "homolog", ""])
def test_recusa_rodar_fora_de_desenvolvimento(monkeypatch, ambiente):
    # Regra do projeto: preço inventado nunca pode existir em produção.
    monkeypatch.setattr(
        runner, "get_settings", lambda: Settings(app_env=ambiente, secret_key="x" * 48)
    )

    with pytest.raises(SeedNotAllowedError) as erro:
        ensure_seed_allowed()

    assert ambiente in str(erro.value)


def test_conta_de_desenvolvimento_so_em_dev(monkeypatch):
    monkeypatch.setattr(runner, "get_settings", lambda: Settings(app_env="dev"))
    assert dev_user_allowed()


def test_demo_nao_cria_conta_de_senha_versionada(monkeypatch):
    # A senha da conta está no repositório: no servidor público seria porta aberta.
    monkeypatch.setattr(
        runner, "get_settings", lambda: Settings(app_env="demo", secret_key="x" * 48)
    )
    assert not dev_user_allowed()
