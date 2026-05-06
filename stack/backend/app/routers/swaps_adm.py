from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import SwapOrder, SwapOrderLog
from app.routers.auth_adm import get_adm_user

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

