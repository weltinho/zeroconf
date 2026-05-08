from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import rpc
from app.db import get_session
from app.models import SwapOrder, SwapOrderLog
from app.routers.auth_adm import get_adm_user
from app.routers.node import _ensure_fee_address_index0, _ensure_wallet_loaded
from app.settings import settings
from app.swap_logs import log_swap_step

router = APIRouter(prefix="/adm/swaps", tags=["adm-swaps"])


@router.get("/orders")
async def list_orders(
    _user: dict = Depends(get_adm_user),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[dict[str, Any]]:
    q = await session.execute(
        select(SwapOrder).order_by(desc(SwapOrder.id)).limit(limit)
    )
    rows = q.scalars().all()
    order_ids = [r.id for r in rows]
    deposit_txid_by_order: dict[int, str] = {}
    if order_ids:
        lq = await session.execute(
            select(SwapOrderLog)
            .where(
                SwapOrderLog.order_id.in_(order_ids),
                SwapOrderLog.stage == "handle_hashtx.match_order",
            )
            .order_by(desc(SwapOrderLog.id))
        )
        for log in lq.scalars().all():
            if log.order_id in deposit_txid_by_order:
                continue
            raw = log.details_json
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except Exception:
                continue
            txid = payload.get("event_txid")
            if isinstance(txid, str) and txid:
                deposit_txid_by_order[log.order_id] = txid
    return [
        {
            "order_id": r.id,
            "status": r.status,
            "output_sats": r.output_sats,
            "required_deposit_sats": r.required_deposit_sats,
            "deposit_btc_address": r.deposit_btc_address,
            "deposit_txid": deposit_txid_by_order.get(r.id),
            "destination_btc_address": r.destination_btc_address,
            "payout_txid": r.payout_txid,
            "last_error": r.last_error,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/orders/{order_id}/logs")
async def order_logs(
    order_id: int,
    _user: dict = Depends(get_adm_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    exists = await session.execute(select(SwapOrder.id).where(SwapOrder.id == order_id))
    if exists.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="order not found")

    q = await session.execute(
        select(SwapOrderLog)
        .where(SwapOrderLog.order_id == order_id)
        .order_by(desc(SwapOrderLog.id))
        .limit(300)
    )
    rows = q.scalars().all()
    return [
        {
            "id": r.id,
            "order_id": r.order_id,
            "stage": r.stage,
            "message": r.message,
            "details_json": r.details_json,
            "auxiliary_info": r.auxiliary_info,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


class StuckOrderItem(BaseModel):
    order_id: int
    provider: str
    status: str
    deposit_btc_address: str
    actual_deposit_sats: int
    created_at: str
    last_error: str | None
    origin_address: str | None


def _sats_to_btc_str(sats: int) -> str:
    d = (Decimal(sats) / Decimal(100_000_000)).quantize(Decimal("0.00000001"))
    return format(d, "f")


async def _extract_origin_address_from_event_tx(event_txid: str) -> str | None:
    if not event_txid:
        return None
    try:
        tx = await rpc.call("getrawtransaction", [event_txid, True])
    except Exception:
        return None
    if not isinstance(tx, dict):
        return None
    vins = tx.get("vin")
    if not isinstance(vins, list):
        return None
    for vin in vins:
        if not isinstance(vin, dict):
            continue
        prev_txid = str(vin.get("txid") or "").strip()
        vout_n = vin.get("vout")
        if not prev_txid or not isinstance(vout_n, int):
            continue
        try:
            prev = await rpc.call("getrawtransaction", [prev_txid, True])
        except Exception:
            continue
        if not isinstance(prev, dict):
            continue
        prev_vouts = prev.get("vout")
        if not isinstance(prev_vouts, list):
            continue
        target = next((x for x in prev_vouts if isinstance(x, dict) and int(x.get("n", -1)) == vout_n), None)
        if not isinstance(target, dict):
            continue
        spk = target.get("scriptPubKey")
        if not isinstance(spk, dict):
            continue
        addr = str(spk.get("address") or "").strip()
        if addr:
            return addr
        addrs = spk.get("addresses")
        if isinstance(addrs, list):
            for a in addrs:
                s = str(a or "").strip()
                if s:
                    return s
    return None


@router.get("/stuck-payments")
async def list_stuck_payments(
    _user: dict = Depends(get_adm_user),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[dict[str, Any]]:
    q = await session.execute(
        select(SwapOrder)
        .where(
            SwapOrder.actual_deposit_sats.is_not(None),
            SwapOrder.actual_deposit_sats > 0,
            SwapOrder.payout_txid.is_(None),
            SwapOrder.status.in_(["deposit_detected", "provider_processing", "error"]),
        )
        .order_by(SwapOrder.actual_deposit_sats.asc(), SwapOrder.created_at.asc())
        .limit(limit)
    )
    rows = q.scalars().all()
    if not rows:
        return []

    order_ids = [r.id for r in rows]
    lq = await session.execute(
        select(SwapOrderLog)
        .where(
            SwapOrderLog.order_id.in_(order_ids),
            SwapOrderLog.stage == "handle_hashtx.match_order",
        )
        .order_by(desc(SwapOrderLog.id))
    )
    txid_by_order: dict[int, str] = {}
    for log in lq.scalars().all():
        if log.order_id in txid_by_order:
            continue
        try:
            payload = json.loads(log.details_json or "{}")
        except Exception:
            continue
        txid = str(payload.get("event_txid") or "").strip()
        if txid:
            txid_by_order[log.order_id] = txid

    out: list[dict[str, Any]] = []
    for r in rows:
        event_txid = txid_by_order.get(r.id, "")
        origin = await _extract_origin_address_from_event_tx(event_txid) if event_txid else None
        out.append(
            {
                "order_id": r.id,
                "provider": r.provider,
                "status": r.status,
                "deposit_btc_address": r.deposit_btc_address,
                "actual_deposit_sats": int(r.actual_deposit_sats or 0),
                "created_at": r.created_at.isoformat(),
                "last_error": r.last_error,
                "origin_address": origin,
            }
        )
    return out


class RescueFundsRequest(BaseModel):
    mode: str  # "origin" | "forward"
    destination_btc_address: str | None = None


@router.post("/orders/{order_id}/rescue")
async def rescue_stuck_payment(
    order_id: int,
    req: RescueFundsRequest,
    _user: dict = Depends(get_adm_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    row = await session.execute(select(SwapOrder).where(SwapOrder.id == order_id))
    order = row.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")
    if not order.deposit_btc_address.strip():
        raise HTTPException(status_code=400, detail="order has no deposit address")

    wallet = settings.bitcoin_operator_wallet.strip()
    if not wallet:
        raise HTTPException(status_code=503, detail="operator wallet not configured")
    await _ensure_wallet_loaded(wallet)

    unspent = await rpc.call("listunspent", [0, 9999999, [order.deposit_btc_address], True], wallet=wallet)
    if not isinstance(unspent, list):
        raise HTTPException(status_code=502, detail="listunspent invalid response")

    utxos: list[dict[str, Any]] = []
    total_sats = 0
    for u in unspent:
        if not isinstance(u, dict):
            continue
        if str(u.get("address") or "") != order.deposit_btc_address:
            continue
        if not u.get("spendable", True):
            continue
        txid = str(u.get("txid") or "").strip()
        vout = u.get("vout")
        amount = u.get("amount")
        if not txid or not isinstance(vout, int):
            continue
        sats = int((Decimal(str(amount or 0)) * Decimal(100_000_000)).to_integral_value())
        if sats <= 0:
            continue
        utxos.append({"txid": txid, "vout": vout})
        total_sats += sats
    if not utxos or total_sats <= 0:
        raise HTTPException(status_code=400, detail="no spendable UTXOs on deposit address")

    destination = ""
    if req.mode == "origin":
        # Busca tx de depósito mais recente para tentar inferir origem.
        lq = await session.execute(
            select(SwapOrderLog)
            .where(
                SwapOrderLog.order_id == order_id,
                SwapOrderLog.stage == "handle_hashtx.match_order",
            )
            .order_by(desc(SwapOrderLog.id))
            .limit(1)
        )
        log = lq.scalar_one_or_none()
        event_txid = ""
        if log:
            try:
                payload = json.loads(log.details_json or "{}")
                event_txid = str(payload.get("event_txid") or "").strip()
            except Exception:
                event_txid = ""
        destination = await _extract_origin_address_from_event_tx(event_txid) if event_txid else ""
        if not destination:
            raise HTTPException(status_code=400, detail="could not infer origin address")
    elif req.mode == "forward":
        destination = str(req.destination_btc_address or "").strip()
        if not destination:
            raise HTTPException(status_code=422, detail="destination_btc_address is required for forward mode")
    else:
        raise HTTPException(status_code=422, detail="mode must be origin or forward")

    change_address = await _ensure_fee_address_index0(wallet)
    outputs = {destination: _sats_to_btc_str(total_sats)}
    options: dict[str, Any] = {
        "replaceable": False,
        "lockUnspents": True,
        "changeAddress": change_address,
        "add_inputs": False,
        "subtractFeeFromOutputs": [0],
    }
    funded = await rpc.call("walletcreatefundedpsbt", [utxos, outputs, 0, options], wallet=wallet)
    if not isinstance(funded, dict) or not isinstance(funded.get("psbt"), str):
        raise HTTPException(status_code=502, detail="walletcreatefundedpsbt invalid response")
    processed = await rpc.call("walletprocesspsbt", [funded["psbt"]], wallet=wallet)
    if not isinstance(processed, dict) or not isinstance(processed.get("psbt"), str):
        raise HTTPException(status_code=502, detail="walletprocesspsbt invalid response")
    finalized = await rpc.call("finalizepsbt", [processed["psbt"]], wallet=wallet)
    if not isinstance(finalized, dict) or not finalized.get("complete") or not isinstance(finalized.get("hex"), str):
        raise HTTPException(status_code=502, detail="finalizepsbt incomplete response")
    txid = await rpc.call("sendrawtransaction", [finalized["hex"]], wallet=wallet)

    order.status = "paid_out"
    order.payout_txid = str(txid)
    order.last_error = None
    await log_swap_step(
        session,
        order.id,
        "rescue.funds.sent",
        "rescue transfer sent from stuck order",
        {"mode": req.mode, "destination_btc_address": destination, "rescue_txid": str(txid)},
    )
    await session.commit()
    return {"ok": True, "order_id": order.id, "rescue_txid": str(txid), "destination_btc_address": destination}

