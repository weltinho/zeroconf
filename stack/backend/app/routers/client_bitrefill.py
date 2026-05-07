"""Endpoints públicos do cliente — catálogo Bitrefill («Compras»).

Proxies leituras à API Bitrefill; respostas já normalizadas para o frontend (selects).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from app.bitrefill_client import BitrefillClientError, bitrefill_list_products
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/client/bitrefill", tags=["client-bitrefill"])

DEFAULT_CATALOG_COUNTRY = "BR"

# Por linha: slug devolvido ao frontend, label PT, ``product_type`` (query ``type`` na Bitrefill), ``category`` (CSV).
# Ver https://docs.bitrefill.com/docs/searching-products — gift cards usam ``type=gift_card``, não ``category``.
_CATALOG_FILTERS_ROWS: tuple[tuple[str, str, Optional[str], Optional[str]], ...] = (
    ("", "Todas", None, None),
    ("phone_refill", "Recarga celular", "phone_refill", None),
    ("streaming_ent", "Streaming / entretenimento", None, "streaming,entertainment"),
    ("games", "Jogos", None, "games"),
    ("gift_card", "Gift cards / varejo", "gift_card", None),
    ("esim", "Dados / eSIM", "esim", None),
)

# Slugs antigos enviados pelo frontend antes do mapeamento type vs category.
_LEGACY_SLUG_CANONICAL: dict[str, str] = {
    "refill": "phone_refill",
    "ecommerce,retail,gift_card": "gift_card",
    "ecommerce,retail,giftcard": "gift_card",
}

_FILTER_BY_SLUG: dict[str, tuple[Optional[str], Optional[str]]] = {
    row[0]: (row[2], row[3]) for row in _CATALOG_FILTERS_ROWS
}


def _catalog_category_options_public() -> list[dict[str, str]]:
    return [{"slug": s, "label": lab} for s, lab, _, _ in _CATALOG_FILTERS_ROWS]


def _resolve_catalog_filter(category_slug: str) -> tuple[Optional[str], Optional[str]]:
    """Devolve ``(product_type, category)`` para a API Bitrefill (só um costuma ser não-nulo)."""

    slug = category_slug.strip()
    if not slug:
        return (None, None)
    canon = _LEGACY_SLUG_CANONICAL.get(slug, slug)
    if canon not in _FILTER_BY_SLUG:
        raise HTTPException(
            status_code=422,
            detail=f"filtro de catálogo desconhecido: {category_slug!r}",
        )
    return _FILTER_BY_SLUG[canon]


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
        from urllib.parse import parse_qs, urlparse

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
    """Filtros de catálogo (slugs combinados onde a Bitrefill aceita ``category``; gift cards via ``type``)."""

    _require_bitrefill()
    return {"data": _catalog_category_options_public()}


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
        product_type_bitrefill, category_bitrefill = _resolve_catalog_filter(cat_trim)
        if product_type_bitrefill:
            kw["product_type"] = product_type_bitrefill
        if category_bitrefill:
            kw["category"] = category_bitrefill

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
