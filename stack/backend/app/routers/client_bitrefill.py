"""Endpoints públicos do cliente — catálogo Bitrefill («Compras»).

Proxies leituras à API Bitrefill; respostas já normalizadas para o frontend (selects).
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.bitrefill_client import BitrefillClientError, bitrefill_get_product, bitrefill_list_products
from app.db import get_session
from app.deps import rpc
from app.models import SwapOrder, SwapOrderBitrefill
from app.routers.client import CreateOrderResponse
from app.routers.node import _ensure_wallet_loaded
from app.settings import settings
from app.swap_logs import log_swap_step
from app.swap_processor import (
    DEFAULT_SWAP_FEE_RATE_SAT_VB,
    MIN_SWAP_FEE_SATS,
    _btc_kvb_to_sat_vb_ceil,
    _estimate_fee_sats,
)
from app.signet_demo import (
    SIGNET_DEMO_FORCE_FAIL_BITREFILL_PROVIDER_ID,
    chain_is_signet,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/client/bitrefill", tags=["client-bitrefill"])

DEFAULT_CATALOG_COUNTRY = "BR"
BITREFILL_EXTRA_SPREAD_SATS = 1000

# Por linha: slug devolvido ao frontend, label PT, ``product_type`` (query ``type`` na Bitrefill), ``category`` (CSV).
# Ver https://docs.bitrefill.com/docs/searching-products — gift cards usam ``type=gift_card``, não ``category``.
_CATALOG_FILTERS_ROWS: tuple[tuple[str, str, Optional[str], Optional[str]], ...] = (
    ("", "Todas", None, None),
    ("phone_refill", "Recarga celular", "phone_refill", None),
    ("streaming_ent", "Streaming / entretenimento", None, "streaming,entertainment"),
    ("games", "Jogos", None, "games"),
    ("gift_card", "Gift cards / varejo", "gift_card", None),
    ("esim", "Dados / eSIM", None, "esim"),
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


def _canonical_catalog_slug(category_slug: str) -> str:
    slug = category_slug.strip()
    if not slug:
        return ""
    return _LEGACY_SLUG_CANONICAL.get(slug, slug)


def _post_filter_catalog_products(products: list[dict[str, Any]], category_slug: str) -> list[dict[str, Any]]:
    """Aplica filtros defensivos no catálogo quando a API upstream vem inconsistente.

    Observação: a Bitrefill pode retornar gift cards em consultas `type=phone_refill`.
    """
    canon = _canonical_catalog_slug(category_slug)
    if canon == "phone_refill":
        return [
            p
            for p in products
            if str(p.get("recipient_type") or "").strip().lower() == "phone_number"
        ]
    if canon == "gift_card":
        return [
            p
            for p in products
            if str(p.get("recipient_type") or "").strip().lower() != "phone_number"
        ]
    if canon == "esim":
        def _is_esim_product(p: dict[str, Any]) -> bool:
            pid = str(p.get("id") or "").strip().lower()
            name = str(p.get("name") or "").strip().lower()
            cats = [str(c).strip().lower() for c in (p.get("categories") or [])]
            if "esim" in pid or "e-sim" in pid:
                return True
            if "esim" in name or "e-sim" in name:
                return True
            return any(("esim" in c or "e-sim" in c) for c in cats)

        return [p for p in products if _is_esim_product(p)]
    return products


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
    normalized = _post_filter_catalog_products(normalized, cat_trim)

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


PLACEHOLDER_BITREFILL_DESTINATION = "BITREFILL_PENDING"


def _extract_package_quote_sats(sel: dict[str, Any]) -> int | None:
    raw = sel.get("price")
    if raw is None:
        return None
    try:
        return max(0, int(Decimal(str(raw)).to_integral_value(rounding="ROUND_HALF_UP")))
    except Exception:
        return None


class BitrefillCreateOrderRequest(BaseModel):
    product_id: str = Field(..., min_length=1, max_length=128)
    package_id: str = Field("", max_length=384)
    customer_email: EmailStr
    phone_number: str = Field("", max_length=48)
    country: str = Field("BR", min_length=2, max_length=2)


@router.post("/orders", response_model=CreateOrderResponse)
async def bitrefill_create_order(
    req: BitrefillCreateOrderRequest,
    session: AsyncSession = Depends(get_session),
) -> Any:
    """Abre uma ordem: depósito à nossa wallet; após pagamento criamos invoice Bitrefill e pagamos.

    Fluxo técnico: ver ``swap_processor._ensure_bitrefill_invoice``.
    """

    _require_bitrefill()

    wallet = settings.bitcoin_operator_wallet.strip()
    if not wallet:
        raise HTTPException(
            status_code=503,
            detail="operator wallet not configured (BITCOIN_OPERATOR_WALLET)",
        )

    cc = req.country.strip().upper()
    if len(cc) != 2:
        raise HTTPException(status_code=422, detail="country inválido (ISO-alpha-2)")

    try:
        prod_raw = await bitrefill_get_product(req.product_id.strip())
    except BitrefillClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    body = prod_raw.get("data") if isinstance(prod_raw, dict) else None
    if not isinstance(body, dict):
        raise HTTPException(status_code=502, detail="produto Bitrefill inválido")

    pcode = str(body.get("country_code") or "").strip().upper()
    if pcode and pcode != cc:
        raise HTTPException(
            status_code=400,
            detail=f"produto é do país {pcode}, não {cc}",
        )
    if not bool(body.get("in_stock")):
        raise HTTPException(status_code=400, detail="produto indisponível")
    categories = [str(x).strip().lower() for x in (body.get("categories") or []) if str(x or "").strip()]
    force_fail_games_signet = await chain_is_signet() and ("games" in categories)

    rng = body.get("range")
    pkgs = body.get("packages") if isinstance(body.get("packages"), list) else []
    pkg_id_needle = req.package_id.strip()

    recipient_type = str(body.get("recipient_type") or "")
    if recipient_type == "phone_number":
        tel = req.phone_number.strip()
        if not tel.startswith("+"):
            raise HTTPException(
                status_code=400,
                detail="Este produto precisa de telefone em formato E.164 (ex.: +5511987654321).",
            )
    else:
        tel = ""

    selected: dict[str, Any] | None = None
    quoted_sats = 0
    canonical_pkg_id = ""

    if pkgs:
        if not pkg_id_needle:
            raise HTTPException(
                status_code=400,
                detail="Seleccione um valor/pacote (package_id obrigatório).",
            )
        for p in pkgs:
            if not isinstance(p, dict):
                continue
            cand = (
                str(p.get("package_id") or "").strip()
                or str(p.get("id") or "").strip()
            )
            if cand == pkg_id_needle:
                selected = p
                canonical_pkg_id = cand
                break
        if selected is None:
            raise HTTPException(status_code=400, detail="package_id não existe neste produto")
        q = _extract_package_quote_sats(selected)
        if not q:
            raise HTTPException(
                status_code=502,
                detail="Não foi possível ler o preço (sats) do pacote escolhido.",
            )
        quoted_sats = q
    elif isinstance(rng, dict):
        raise HTTPException(
            status_code=400,
            detail="Produtos só com valor variável (range) — escolha outro produto por agora.",
        )
    else:
        raise HTTPException(status_code=400, detail="produto sem pacotes nem range reconhecível")

    # Mantemos o spread configurável e adicionamos um colchão fixo extra de 1000 sats
    # para proteger oscilações entre o quote e a emissão da invoice do provedor.
    spread_base = max(int(getattr(settings, "bitrefill_spread_sat", 0) or 0), 0)
    spread = spread_base + BITREFILL_EXTRA_SPREAD_SATS

    fee_rate = DEFAULT_SWAP_FEE_RATE_SAT_VB
    try:
        fee_rate = int(
            getattr(settings, "swap_fee_rate_sat_vb", DEFAULT_SWAP_FEE_RATE_SAT_VB)
            or DEFAULT_SWAP_FEE_RATE_SAT_VB
        )
    except Exception:
        fee_rate = DEFAULT_SWAP_FEE_RATE_SAT_VB
    if fee_rate <= 0:
        fee_rate = DEFAULT_SWAP_FEE_RATE_SAT_VB
    try:
        mp = await rpc.call("getmempoolinfo")
        if isinstance(mp, dict) and mp.get("mempoolminfee") is not None:
            floor_rate = _btc_kvb_to_sat_vb_ceil(mp.get("mempoolminfee"))
            if floor_rate > fee_rate:
                fee_rate = floor_rate
    except Exception:
        pass

    fee_est = max(_estimate_fee_sats(fee_rate, num_inputs=1, num_outputs=2), MIN_SWAP_FEE_SATS)
    required_total = quoted_sats + fee_est + spread

    order = SwapOrder(
        output_sats=int(quoted_sats),
        destination_btc_address=PLACEHOLDER_BITREFILL_DESTINATION,
        deposit_btc_address=f"pending-{uuid4()}",
        required_deposit_sats=int(required_total),
        fee_rate_sat_vb=fee_rate,
        provider="bitrefill",
        provider_id=SIGNET_DEMO_FORCE_FAIL_BITREFILL_PROVIDER_ID if force_fail_games_signet else None,
        status="created",
        payout_txid=None,
        last_error=None,
    )
    session.add(order)
    await session.flush()

    try:
        await _ensure_wallet_loaded(wallet)
        refund_addr = await rpc.call(
            "getnewaddress",
            [f"bitrefill-refund-{order.id}", "bech32"],
            wallet=wallet,
        )
        deposit_addr = await rpc.call(
            "getnewaddress",
            [f"bitrefill-order-{order.id}", "bech32"],
            wallet=wallet,
        )
    except Exception as exc:
        order.status = "error"
        order.last_error = f"wallet RPC: {exc}"
        await log_swap_step(
            session,
            order.id,
            "bitrefill.order.addresses",
            "falha getnewaddress",
            {"error": str(exc)},
        )
        await session.commit()
        raise HTTPException(
            status_code=502,
            detail=f"falha ao gerar endereços (rpc): {str(exc)[:512]}",
        ) from exc

    br = SwapOrderBitrefill(
        swap_order_id=order.id,
        product_id=req.product_id.strip(),
        package_id=canonical_pkg_id if canonical_pkg_id else None,
        product_name_snapshot=str(body.get("name") or "")[:255] or None,
        customer_email=str(req.customer_email).strip(),
        recipient_phone=tel.strip() or None,
        refund_btc_address=str(refund_addr),
        quoted_price_sats=int(quoted_sats),
    )
    session.add(br)

    order.deposit_btc_address = str(deposit_addr)
    order.status = "awaiting_deposit"
    await log_swap_step(
        session,
        order.id,
        "bitrefill.order.created",
        "ordem compra criada — aguarda depósito on-chain na nossa wallet",
        {
            "product_id": br.product_id,
            "quoted_price_sats": quoted_sats,
            "fee_est_sats": fee_est,
            "spread_sats": spread,
            "required_deposit_sats": required_total,
            "signet_force_fail_games": force_fail_games_signet,
        },
    )
    await session.commit()

    return CreateOrderResponse(
        order_id=order.id,
        status=order.status,
        deposit_btc_address=order.deposit_btc_address,
        required_deposit_sats=order.required_deposit_sats,
        output_sats=order.output_sats,
        fee_rate_sat_vb=order.fee_rate_sat_vb,
        provider="bitrefill",
    )
