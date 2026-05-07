"""Contrato HTTP com a Bitrefill — mocks (`httpx.MockTransport`), sem rede nem stack interna."""

from __future__ import annotations

import json

import httpx
import pytest

from app.bitrefill_client import (
    BITREFILL_HTTP_USER_AGENT,
    BitrefillClientError,
    bitrefill_create_invoice,
    bitrefill_get_invoice,
    bitrefill_list_invoices,
    bitrefill_list_products,
    bitrefill_ping,
)

pytestmark = pytest.mark.usefixtures("stub_bitrefill_settings")


@pytest.mark.asyncio
async def test_ping_returns_pong_and_headers() -> None:
    seen: dict[str, str] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        for k, v in request.headers.multi_items():
            seen[str(k).lower()] = str(v)
        return httpx.Response(200, json={"meta": {"_endpoint": "/ping"}, "message": "pong"})

    body = await bitrefill_ping(transport=httpx.MockTransport(handler))
    assert body["message"] == "pong"
    assert seen["authorization"] == "Bearer test-token"
    assert seen["user-agent"] == BITREFILL_HTTP_USER_AGENT


@pytest.mark.asyncio
async def test_ping_maps_http_error_to_exception() -> None:

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "Invalid token"})

    with pytest.raises(BitrefillClientError) as ei:
        await bitrefill_ping(transport=httpx.MockTransport(handler))
    assert ei.value.status_code == 401
    assert "Invalid" in str(ei.value)


@pytest.mark.asyncio
async def test_list_products_query_string() -> None:
    url_holder: dict[str, str] = {}

    async def capture(request: httpx.Request) -> httpx.Response:
        url_holder["url"] = str(request.url)
        return httpx.Response(200, json={"meta": {}, "data": [{"id": "x"}]})

    out = await bitrefill_list_products(
        country="BR",
        category="refill,games",
        include_test_products=False,
        transport=httpx.MockTransport(capture),
    )
    u = url_holder["url"]
    assert "country=BR" in u
    assert "include_test_products=false" in u.lower()
    assert "refill" in u and "games" in u
    assert out["data"][0]["id"] == "x"


@pytest.mark.asyncio
async def test_create_invoice_posts_json_body() -> None:
    received: dict[str, bytes | str] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        received["method"] = request.method
        received["body"] = request.content
        assert request.headers.get("content-type", "").startswith("application/json")
        return httpx.Response(
            200,
            json={
                "meta": {"_endpoint": "/invoices"},
                "data": {
                    "id": "inv-uuid-1",
                    "status": "unpaid",
                    "payment": {
                        "method": "bitcoin",
                        "address": "bc1qliveaddr",
                        "price": 0.00001234,
                        "currency": "BTC",
                    },
                },
            },
        )

    payload = {
        "products": [{"product_id": "amazon-us", "value": 50, "quantity": 1}],
        "payment_method": "bitcoin",
        "refund_address": "bc1qrefundxx",
        "email": "user@example.com",
        "send_email": True,
    }

    out = await bitrefill_create_invoice(payload, transport=httpx.MockTransport(handler))

    decoded = json.loads(received["body"])
    assert decoded["payment_method"] == "bitcoin"
    assert decoded["products"][0]["product_id"] == "amazon-us"
    assert received["method"] == "POST"
    assert out["data"]["id"] == "inv-uuid-1"
    assert out["data"]["payment"]["address"] == "bc1qliveaddr"


@pytest.mark.asyncio
async def test_get_invoice_uses_path() -> None:

    async def handler(request: httpx.Request) -> httpx.Response:
        assert "/invoices/aaa-bbb-ccc" in str(request.url)
        return httpx.Response(200, json={"meta": {}, "data": {"id": "aaa-bbb-ccc"}})

    out = await bitrefill_get_invoice("aaa-bbb-ccc", transport=httpx.MockTransport(handler))
    assert out["data"]["id"] == "aaa-bbb-ccc"


@pytest.mark.asyncio
async def test_get_invoice_empty_id_raises_locally() -> None:
    with pytest.raises(BitrefillClientError) as ei:
        await bitrefill_get_invoice("  ", transport=None)
    assert "vazio" in str(ei.value).lower()


@pytest.mark.asyncio
async def test_list_invoices_params() -> None:
    urls: dict[str, str] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        urls["u"] = str(request.url)
        return httpx.Response(200, json={"meta": {"count": 0}, "data": []})

    await bitrefill_list_invoices(start=10, limit=20, transport=httpx.MockTransport(handler))
    assert "start=10" in urls["u"] and "limit=20" in urls["u"]



