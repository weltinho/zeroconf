"""Suporte isolado à suite Bitrefill — não altera o restante dos testes da stack.

Carrega opcionalmente `.env` na raiz e `stack/.env` (`BITREFILL_*` deve estar em stack/.env).
"""

from __future__ import annotations

from pathlib import Path

import pytest


def pytest_configure(config: pytest.Config) -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    repo_root = Path(__file__).resolve().parents[4]
    load_dotenv(repo_root / ".env", override=False)
    stack_env = repo_root / "stack" / ".env"
    if stack_env.is_file():
        load_dotenv(stack_env, override=False)


@pytest.fixture
def stub_bitrefill_settings(monkeypatch: pytest.MonkeyPatch):
    """Bearer + base URL fictícios para chamadas mockadas (MockTransport)."""

    from app.settings import settings

    monkeypatch.setattr(settings, "bitrefill_enabled", True)
    monkeypatch.setattr(settings, "bitrefill_api_key", "test-token")
    monkeypatch.setattr(settings, "bitrefill_base_url", "https://api-bitrefill.com/v2")


@pytest.fixture
def live_bitrefill_key(monkeypatch: pytest.MonkeyPatch):
    """Injecta chave real da Bitrefill para testes live (sem mock)."""

    import os

    from app.settings import settings

    api_key = (os.environ.get("BITREFILL_API_KEY") or "").strip()
    if not api_key:
        pytest.skip("BITREFILL_API_KEY não definido (export ou stack/.env)")
    monkeypatch.setattr(settings, "bitrefill_api_key", api_key)


def _live_contract_enabled() -> bool:
    import os

    return os.environ.get("BITREFILL_RUN_LIVE") in {"1", "true", "True", "yes"}


@pytest.fixture
def require_live_bitrefill_contract() -> None:
    if not _live_contract_enabled():
        pytest.skip("BITREFILL_RUN_LIVE=1 para chamadas HTTP reais à Bitrefill")
