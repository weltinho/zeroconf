"""Endpoints públicos do cliente — catálogo Bitrefill («Compras»).

Proxies leituras à API Bitrefill; respostas já normalizadas para o frontend (selects).
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, HTTPException, Query

from app.bitrefill_client import BitrefillClientError, bitrefill_list_products
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/client/bitrefill", tags=["client-bitrefill"])

DEFAULT_CATALOG_COUNTRY = "BR"

# Agrupamentos enviados à API como `category` (CSV onde aplicável): label curto PT.
CATALOG_CATEGORY_OPTIONS: tuple[dict[str, str], ...] = (
    {"slug": "", "label": "Todas"},
    {"slug": "refill", "label": "Recarga celular"},
    {"slug": "streaming,entertainment", "label": "Streaming / entretenimento"},
    {"slug": "games", "label": "Jogos"},
    {"slug": "ecommerce,retail,giftcard", "label": "Gift cards / varejo"},
    {"slug": "esim,SIM,data", "label": "Dados / eSIM"},
)


def _require_bitrefill() -> None:
    if not settings.bitrefill_enabled:
        raise HTTPException(
            status_code=503,
            detail="Bitrefill desativado (BITREFILL_ENABLED=false).",
        )
    if not settings.bitrefill_api_key.strip():
        raise HTTPException(
            status_code=503,
            detail="BITREFILL_API_KEY não configurada no servidor.",
        )


def _next_start_from_meta(meta: Any) -> Optional[int]:
    if not isinstance(meta, dict):
        return None
    nxt = meta.get("_next")
    if not nxt or not isinstance(nxt, str):
        return None
    try:
        q = parse_qs(urlparse(nxt).query)
        starts = q.get("start", [])
        if not starts:
            return None
        return int(starts[0])
    except (ValueError, TypeError):
        return None


def _normalize_product(raw: dict[str, Any]) -> dict[str, Any]:
    packages_out: list[dict[str, Any]] = []
    for pk in raw.get("packages") or []:
        if isinstance(pk, dict):
            packages_out.append(
                {
                    "id": pk.get("id"),
                    "value": pk.get("value"),
                    "price": pk.get("price"),
                    "amount": pk.get("amount"),
                }
            )

    rg = raw.get("range")
    range_out = rg if isinstance(rg, dict) else None

    return {
        "id": raw.get("id"),
        "name": raw.get("name"),
        "currency": raw.get("currency"),
        "recipient_type": raw.get("recipient_type"),
        "in_stock": bool(raw.get("in_stock")),
        "categories": list(raw.get("categories") or []),
        "packages": packages_out,
        "range": range_out,
        "country_code": raw.get("country_code"),
    }


@router.get("/catalog/countries")
async def catalog_countries() -> dict[str, Any]:
    """Países com catálogo (MVP só Brasil na UI ZeroConf — expandir aqui depois)."""

    _require_bitrefill()
    return {
        "data": [{"code": DEFAULT_CATALOG_COUNTRY, "name": "Brasil"}],
    }


@router.get("/catalog/categories")
async def catalog_categories() -> dict[str, Any]:
    """Filtros de catálogo (slugs combinados onde a Bitrefill aceita CSV)."""

    _require_bitrefill()
    return {"data": list(CATALOG_CATEGORY_OPTIONS)}


@router.get("/catalog/products")
async def catalog_products(
    start: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=50),
    category: str = Query("", max_length=200),
    country: str = Query(DEFAULT_CATALOG_COUNTRY, min_length=2, max_length=2),
) -> dict[str, Any]:
    """Lista produtos Bitrefill com payloads enxutos para selects."""

    _require_bitrefill()
    cc = country.strip().upper()
    if len(cc) != 2:
        raise HTTPException(status_code=422, detail="country deve ser código ISO-alpha-2 (ex.: BR)")

    kw: dict[str, Any] = {
        "country": cc,
        "start": start,
        "limit": limit,
        "include_test_products": False,
    }
    cat_trim = category.strip()
    if cat_trim:
        kw["category"] = cat_trim

    try:
        raw = await bitrefill_list_products(**kw)
    except BitrefillClientError as exc:
        logger.warning("Bitrefill list_products falhou: %s", exc)
        detail = str(exc)
        raise HTTPException(
            status_code=exc.status_code if exc.status_code in (401, 403, 429) else 502,
            detail=detail,
        ) from exc

    if not isinstance(raw, dict):
        raise HTTPException(status_code=502, detail="resposta Bitrefill inválida")

    meta_in = raw.get("meta") if isinstance(raw.get("meta"), dict) else {}
    rows = raw.get("data") if isinstance(raw.get("data"), list) else []
    normalized = [_normalize_product(p) for p in rows if isinstance(p, dict)]

    next_start = _next_start_from_meta(meta_in)
    meta_out = {
        "start": meta_in.get("start", start),
        "limit": meta_in.get("limit", limit),
        "next_start": next_start,
    }

    return {
        "country": cc,
        "products": normalized,
        "meta": meta_out,
    }
