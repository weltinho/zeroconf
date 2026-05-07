"""Testes sobre rotas REST de catálogo Bitrefill (sem chamar API externa)."""

from __future__ import annotations

import sys
from typing import Any

import pytest

if sys.version_info < (3, 10):
    pytest.skip(
        "Import de app.main requer Python 3.10+ (anotações PEP 604 noutros módulos); use o Python da stack/Docker.",
        allow_module_level=True,
    )

from httpx import ASGITransport, AsyncClient

import app.routers.client_bitrefill as client_bitrefill
from app.main import app


@pytest.fixture
def bitrefill_conf(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(client_bitrefill.settings, "bitrefill_enabled", True)
    monkeypatch.setattr(client_bitrefill.settings, "bitrefill_api_key", "test-key-bitrefill")


@pytest.fixture
def bitrefill_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(client_bitrefill.settings, "bitrefill_enabled", False)


@pytest.mark.asyncio
async def test_catalog_countries_requires_enable(bitrefill_disabled: None) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/client/bitrefill/catalog/countries")
    assert r.status_code == 503


@pytest.mark.asyncio
async def test_catalog_countries_brazil(bitrefill_conf: None) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/client/bitrefill/catalog/countries")
    assert r.status_code == 200
    body = r.json()
    assert body["data"][0]["code"] == "BR"


@pytest.mark.asyncio
async def test_catalog_products_normalizes(bitrefill_conf: None, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_list_products(**kwargs: Any) -> dict[str, Any]:
        assert kwargs.get("country") == "BR"
        return {
            "meta": {"start": 0, "limit": 50, "_next": "https://api-bitrefill.com/v2/products?start=50&limit=50"},
            "data": [
                {
                    "id": "demo-product",
                    "name": "Demo",
                    "currency": "BRL",
                    "categories": ["games"],
                    "in_stock": True,
                    "recipient_type": "none",
                    "packages": [{"id": "demo-product<&>10", "value": "10", "price": 1000, "amount": 10}],
                }
            ],
        }

    monkeypatch.setattr(client_bitrefill, "bitrefill_list_products", fake_list_products)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/client/bitrefill/catalog/products")

    assert r.status_code == 200
    j = r.json()
    assert j["products"][0]["id"] == "demo-product"
    assert j["products"][0]["packages"][0]["value"] == "10"
    assert j["meta"]["next_start"] == 50
