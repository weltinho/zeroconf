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
from app.models import SwapOrder, SwapOrderLog, SwapRescue
from app.routers.auth_adm import get_adm_user
from app.routers.node import _ensure_fee_address_index0, _ensure_wallet_loaded
from app.settings import settings
from app.swap_logs import log_swap_step

router = APIRouter(prefix="/adm/swaps", tags=["adm-swaps"])


def _mempool_base_url() -> str:
    net = (settings.bitcoin_network or "main").strip().lower()
    if net in {"main", "mainnet", "bitcoin"}:
        return "https://mempool.space"
    if net in {"testnet", "test"}:
        return "https://mempool.space/testnet"
    if net == "signet":
        return "https://mempool.space/signet"
    return "https://mempool.space"


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


def _sats_to_btc_str(sats: int) -> str:
    d = (Decimal(sats) / Decimal(100_000_000)).quantize(Decimal("0.00000001"))
    return format(d, "f")


@router.get("/stuck-payments")
async def list_stuck_payments(
    _user: dict = Depends(get_adm_user),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[dict[str, Any]]:
    wallet = settings.bitcoin_operator_wallet.strip()
    if not wallet:
        raise HTTPException(status_code=503, detail="operator wallet not configured")
    await _ensure_wallet_loaded(wallet)
    fee_index0 = await _ensure_fee_address_index0(wallet)
    mempool_base = _mempool_base_url()

    # Fonte de verdade para "fundos ainda no node":
    # - geral: UTXOs confirmados (minconf=1)
    # - exceção: ordens em error podem aparecer com UTXO 0-conf (minconf=0) para resgate rápido.
    all_unspent_confirmed = await rpc.call("listunspent", [1, 9999999, [], True], wallet=wallet)
    if not isinstance(all_unspent_confirmed, list):
        raise HTTPException(status_code=502, detail="listunspent invalid response")
    all_unspent_any = await rpc.call("listunspent", [0, 9999999, [], True], wallet=wallet)
    if not isinstance(all_unspent_any, list):
        raise HTTPException(status_code=502, detail="listunspent invalid response")

    by_addr_sats_confirmed: dict[str, int] = {}
    by_addr_sats_any: dict[str, int] = {}

    for u in all_unspent_confirmed:
        if not isinstance(u, dict):
            continue
        addr = str(u.get("address") or "").strip()
        if not addr:
            continue
        if addr == fee_index0:
            # Reserva operacional: este endereço financia fees e nunca entra no resgate.
            continue
        amount = u.get("amount")
        try:
            sats = int((Decimal(str(amount or 0)) * Decimal(100_000_000)).to_integral_value())
        except Exception:
            sats = 0
        if sats <= 0:
            continue
        by_addr_sats_confirmed[addr] = by_addr_sats_confirmed.get(addr, 0) + sats

    for u in all_unspent_any:
        if not isinstance(u, dict):
            continue
        addr = str(u.get("address") or "").strip()
        if not addr:
            continue
        if addr == fee_index0:
            continue
        amount = u.get("amount")
        try:
            sats = int((Decimal(str(amount or 0)) * Decimal(100_000_000)).to_integral_value())
        except Exception:
            sats = 0
        if sats <= 0:
            continue
        by_addr_sats_any[addr] = by_addr_sats_any.get(addr, 0) + sats

    q = await session.execute(
        select(SwapOrder)
        .where(
            SwapOrder.deposit_btc_address.is_not(None),
        )
        .order_by(SwapOrder.created_at.asc())
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
        dep_addr = r.deposit_btc_address.strip()
        total_sats = int(by_addr_sats_confirmed.get(dep_addr, 0))
        if total_sats <= 0 and r.status == "error":
            total_sats = int(by_addr_sats_any.get(dep_addr, 0))
        if total_sats <= 0:
            continue
        if dep_addr == fee_index0:
            continue

        payout_confirmed = False
        if (r.payout_txid or "").strip():
            try:
                tx = await rpc.call("gettransaction", [r.payout_txid], wallet=wallet)
                confs = int(tx.get("confirmations") or 0) if isinstance(tx, dict) else 0
                payout_confirmed = confs >= 1
            except Exception:
                payout_confirmed = False
        if payout_confirmed:
            continue

        out.append(
            {
                "order_id": r.id,
                "provider": r.provider,
                "status": r.status,
                "deposit_btc_address": r.deposit_btc_address,
                "actual_deposit_sats": total_sats,
                "created_at": r.created_at.isoformat(),
                "last_error": r.last_error,
                "mempool_deposit_url": f"{mempool_base}/address/{dep_addr}",
            }
        )
    out.sort(key=lambda x: (x["actual_deposit_sats"], x["created_at"]))
    return out


class RescueFundsRequest(BaseModel):
    mode: str  # "forward"
    destination_btc_address: str


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
    fee_index0 = await _ensure_fee_address_index0(wallet)
    if order.deposit_btc_address.strip() == fee_index0:
        raise HTTPException(status_code=400, detail="fee-index-0 cannot be rescued from this screen")

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

    if req.mode != "forward":
        raise HTTPException(status_code=422, detail="mode must be forward")
    destination = str(req.destination_btc_address or "").strip()
    if not destination:
        raise HTTPException(status_code=422, detail="destination_btc_address is required")

    change_address = await _ensure_fee_address_index0(wallet)
    outputs = {destination: _sats_to_btc_str(total_sats)}
    options: dict[str, Any] = {
        "replaceable": False,
        "lockUnspents": True,
        "changeAddress": change_address,
        "add_inputs": False,
        "subtractFeeFromOutputs": [0],
    }
    try:
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
    except HTTPException:
        raise
    except Exception as exc:
        # Devolve erro real para operação (evita "internal server error" genérico no front).
        raise HTTPException(status_code=502, detail=f"rescue broadcast failed: {exc}") from exc

    order.status = "paid_out"
    order.payout_txid = str(txid)
    order.last_error = None
    await log_swap_step(
        session,
        order.id,
        "rescue.funds.sent",
        "rescue transfer sent from stuck order",
        {
            "mode": req.mode,
            "destination_btc_address": destination,
            "rescue_txid": str(txid),
            "rescued_sats": total_sats,
        },
    )
    session.add(
        SwapRescue(
            order_id=order.id,
            mode=req.mode,
            destination_btc_address=destination,
            rescue_txid=str(txid),
            rescued_sats=total_sats,
        )
    )
    await session.commit()
    return {"ok": True, "order_id": order.id, "rescue_txid": str(txid), "destination_btc_address": destination}


@router.get("/rescue-history")
async def rescue_history(
    _user: dict = Depends(get_adm_user),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=100, ge=1, le=300),
) -> list[dict[str, Any]]:
    q = await session.execute(
        select(SwapRescue)
        .order_by(desc(SwapRescue.id))
        .limit(limit)
    )
    rows = q.scalars().all()
    if not rows:
        return []

    order_ids = list({int(r.order_id) for r in rows})
    oq = await session.execute(select(SwapOrder).where(SwapOrder.id.in_(order_ids)))
    order_by_id: dict[int, SwapOrder] = {int(o.id): o for o in oq.scalars().all()}
    mempool_base = _mempool_base_url()

    out: list[dict[str, Any]] = []
    for r in rows:
        oid = int(r.order_id)
        ord_row = order_by_id.get(oid)
        out.append(
            {
                "rescue_id": int(r.id),
                "order_id": oid,
                "created_at": r.created_at.isoformat(),
                "mode": r.mode,
                "destination_btc_address": r.destination_btc_address,
                "rescue_txid": r.rescue_txid,
                "rescued_sats": int(r.rescued_sats),
                "status_after": ord_row.status if ord_row else None,
                "mempool_destination_url": f"{mempool_base}/address/{r.destination_btc_address}",
                "mempool_tx_url": f"{mempool_base}/tx/{r.rescue_txid}",
            }
        )
    return out


@router.get("/rescue-history/{rescue_id}/details")
async def rescue_history_details(
    rescue_id: int,
    _user: dict = Depends(get_adm_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    row = await session.execute(select(SwapRescue).where(SwapRescue.id == rescue_id))
    rescue = row.scalar_one_or_none()
    if rescue is None:
        raise HTTPException(status_code=404, detail="rescue not found")

    wallet = settings.bitcoin_operator_wallet.strip()
    if not wallet:
        raise HTTPException(status_code=503, detail="operator wallet not configured")
    await _ensure_wallet_loaded(wallet)

    tx_wallet: dict[str, Any] | None = None
    tx_raw: dict[str, Any] | None = None
    try:
        got = await rpc.call("gettransaction", [rescue.rescue_txid], wallet=wallet)
        if isinstance(got, dict):
            tx_wallet = got
    except Exception:
        tx_wallet = None
    try:
        got_raw = await rpc.call("getrawtransaction", [rescue.rescue_txid, True])
        if isinstance(got_raw, dict):
            tx_raw = got_raw
    except Exception:
        tx_raw = None

    mempool_base = _mempool_base_url()
    return {
        "rescue_id": int(rescue.id),
        "order_id": int(rescue.order_id),
        "mode": rescue.mode,
        "destination_btc_address": rescue.destination_btc_address,
        "rescue_txid": rescue.rescue_txid,
        "rescued_sats": int(rescue.rescued_sats),
        "created_at": rescue.created_at.isoformat(),
        "mempool_tx_url": f"{mempool_base}/tx/{rescue.rescue_txid}",
        "rpc_wallet": tx_wallet,
        "rpc_rawtx": tx_raw,
    }

