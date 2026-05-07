"""Smoke opcional contra a API real Bitrefill (produção).

Requer `BITREFILL_API_KEY` + `BITREFILL_RUN_LIVE=1` em `stack/.env` (pytest carrega esse ficheiro).

Não usa MockTransport; só valida JSON mínimos que esperamos ao integrar.
"""

from __future__ import annotations

import pytest

from app.bitrefill_client import bitrefill_get_invoice, bitrefill_list_invoices, bitrefill_list_products, bitrefill_ping

pytestmark = [
    pytest.mark.bitrefill_contract,
]


@pytest.fixture(autouse=True)
def _requires_live_gateway(require_live_bitrefill_contract: None, live_bitrefill_key: None) -> None:
    pass


@pytest.mark.asyncio
async def test_live_ping() -> None:
    body = await bitrefill_ping()
    assert body.get("message") == "pong"


@pytest.mark.asyncio
async def test_live_products_brazil_sample() -> None:
    """Primeira página de produtos BR (rede Bitrefill, não Signet Bitcoin)."""

    out = await bitrefill_list_products(country="BR", limit=3, include_test_products=False)
    assert "data" in out
    assert isinstance(out["data"], list)


@pytest.mark.asyncio
async def test_live_invoices_list_empty_or_populated() -> None:
    out = await bitrefill_list_invoices(limit=5)
    assert "data" in out
    assert isinstance(out["data"], list)


@pytest.mark.asyncio
async def test_live_get_known_invoice_optional() -> None:
    """Só útil se `BITREFILL_TEST_INVOICE_ID` apontar para uma invoice válida."""

    import os

    from app.bitrefill_client import BitrefillClientError

    iid = (os.environ.get("BITREFILL_TEST_INVOICE_ID") or "").strip()
    if not iid:
        pytest.skip("BITREFILL_TEST_INVOICE_ID não definido")

    try:
        out = await bitrefill_get_invoice(iid)
    except BitrefillClientError as exc:
        if exc.status_code == 404:
            pytest.skip("Invoice de teste inexistente ou expirada")
        raise

    assert "data" in out or "meta" in out