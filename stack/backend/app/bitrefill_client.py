"""Cliente HTTP para a API Bitrefill v2 (catálogo, invoices).

Sem lógica de negócio nem acesso à BD. Envie `User-Agent` tipo browser: a API
fica atrás de Cloudflare que bloqueia clientes com assinatura omitida (HTTP 1010).

Erros HTTP e de transporte são `BitrefillClientError` com `status_code` e `payload`.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.settings import settings

logger = logging.getLogger(__name__)

# Cloudflare 1010 para muitos UA de biblioteca HTTP; alinhar ao que funciona em servidor.
BITREFILL_HTTP_USER_AGENT = (
    "Mozilla/5.0 (compatible; ZeroConf-Backend/1.0; +https://localhost) "
    "Chrome/131.0.0.0 Safari/537.36"
)

_TIMEOUT = httpx.Timeout(connect=5.0, read=25.0, write=10.0, pool=5.0)


class BitrefillClientError(Exception):
    """Erro retornado pela API Bitrefill ou falha de transporte."""

    def __init__(self, message: str, status_code: Optional[int] = None, payload: Any = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload

    def __str__(self) -> str:
        base = super().__str__()
        if self.status_code is not None:
            return f"[HTTP {self.status_code}] {base}"
        return base


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.bitrefill_api_key}",
        "Accept": "application/json",
        "User-Agent": BITREFILL_HTTP_USER_AGENT,
    }


async def _request(
    method: str,
    path: str,
    *,
    params: Optional[dict[str, Any]] = None,
    json_body: Any = None,
    transport: Optional[httpx.BaseTransport] = None,
) -> Any:
    base = settings.bitrefill_base_url.rstrip("/")
    p = path if path.startswith("/") else f"/{path}"
    url = f"{base}{p}"

    client_kw: dict[str, Any] = {"timeout": _TIMEOUT, "headers": _headers()}
    if transport is not None:
        client_kw["transport"] = transport

    async with httpx.AsyncClient(**client_kw) as client:
        try:
            resp = await client.request(method, url, params=params, json=json_body)
        except httpx.TransportError as exc:
            raise BitrefillClientError(f"transport error: {exc}") from exc

    try:
        data = resp.json()
    except Exception:
        data = resp.text

    if not resp.is_success:
        err = data
        if isinstance(data, dict):
            err = data.get("message") or data.get("detail") or data
        raise BitrefillClientError(str(err)[:512], status_code=resp.status_code, payload=data)

    return data


async def bitrefill_ping(*, transport: Optional[httpx.BaseTransport] = None) -> dict[str, Any]:
    """GET /ping — verifica autenticação e conectividade."""
    return await _request("GET", "/ping", transport=transport)


async def bitrefill_list_products(
    *,
    country: str = "BR",
    start: int = 0,
    limit: int = 50,
    category: Optional[str] = None,
    include_test_products: bool = False,
    transport: Optional[httpx.BaseTransport] = None,
) -> dict[str, Any]:
    """GET /products — catálogo paginado."""
    params: dict[str, Any] = {
        "start": start,
        "limit": min(max(1, limit), 50),
        "include_test_products": str(include_test_products).lower(),
        "country": country,
    }
    if category:
        params["category"] = category
    return await _request("GET", "/products", params=params, transport=transport)


async def bitrefill_create_invoice(
    body: dict[str, Any],
    *,
    transport: Optional[httpx.BaseTransport] = None,
) -> dict[str, Any]:
    """POST /invoices."""

    return await _request("POST", "/invoices", json_body=body, transport=transport)


async def bitrefill_get_invoice(
    invoice_id: str,
    *,
    transport: Optional[httpx.BaseTransport] = None,
) -> dict[str, Any]:
    """GET /invoices/{invoice_id}."""

    iid = invoice_id.strip()
    if not iid:
        raise BitrefillClientError("invoice_id vazio")
    return await _request("GET", f"/invoices/{iid}", transport=transport)


async def bitrefill_list_invoices(
    *,
    start: int = 0,
    limit: int = 50,
    transport: Optional[httpx.BaseTransport] = None,
) -> dict[str, Any]:
    """GET /invoices — lista paginada."""

    params: dict[str, Any] = {"start": start, "limit": min(max(1, limit), 50)}
    return await _request("GET", "/invoices", params=params, transport=transport)
