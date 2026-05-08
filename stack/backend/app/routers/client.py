from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_CEILING
from uuid import uuid4
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import rpc
from app.db import get_session
from app.bitrefill_client import BitrefillClientError, bitrefill_get_invoice
from app.bitrefill_fulfillment import extract_redeem_payload_from_invoice
from app.models import SwapOrder, SwapOrderBitrefill, SwapOrderLog
from app.routers.node import _ensure_wallet_loaded  # reuse wallet bootstrap logic
from app.settings import settings
from app.swap_logs import log_swap_step
from app.signet_demo import (
    BITREFILL_DEMO_STATES,
    bitrefill_get_order_demo_overlay,
    chain_is_signet,
    normalize_bitrefill_demo_state,
)

router = APIRouter(prefix="/client", tags=["client"])
MIN_SWAP_FEE_SATS = 1000
DEFAULT_SWAP_FEE_RATE_SAT_VB = 3


def _parse_amount_to_sats(value: str, unit: Literal["btc", "sats"]) -> int:
    v = value.strip()
    if not v:
        raise ValueError("amount is required")
    try:
        d = Decimal(v)
    except InvalidOperation as exc:
        raise ValueError("invalid amount") from exc
    if d <= 0:
        raise ValueError("amount must be > 0")

    if unit == "sats":
        sats = int(d)
        if Decimal(sats) != d:
            raise ValueError("sats must be an integer")
        return sats

    # btc
    sats = int((d * Decimal(100_000_000)).to_integral_value(rounding="ROUND_FLOOR"))
    if sats <= 0:
        raise ValueError("amount too small")
    return sats


def _estimate_fee_sats(fee_rate_sat_vb: int, num_inputs: int, num_outputs: int) -> int:
    # Estimativa conservadora P2WPKH:
    # vbytes ~= 11 + 68*inputs + 31*outputs
    # Ex.: 1-in / 2-out => ~141 vB (não 140), então arredonda para cima.
    vbytes = 11 + 68 * max(1, num_inputs) + 31 * max(1, num_outputs)
    return int(fee_rate_sat_vb * vbytes)


def _btc_kvb_to_sat_vb_ceil(btc_per_kvb: Any) -> int:
    try:
        d = Decimal(str(btc_per_kvb))
    except Exception:
        return 0
    sat_per_vb = (d * Decimal(100_000_000)) / Decimal(1000)
    return int(sat_per_vb.to_integral_value(rounding=ROUND_CEILING))


class CreateOrderRequest(BaseModel):
    amount: str = Field(..., description="Valor em BTC ou sats como string (ex: '0.001', '150000')")
    unit: Literal["btc", "sats"] = "btc"
    destination_btc_address: str = Field(..., min_length=14, max_length=128)


class CreateOrderResponse(BaseModel):
    order_id: int
    status: str
    deposit_btc_address: str
    required_deposit_sats: int
    output_sats: int
    fee_rate_sat_vb: int
    provider: str = Field(default="internal")


@router.post("/orders", response_model=CreateOrderResponse)
async def create_order(
    req: CreateOrderRequest,
    session: AsyncSession = Depends(get_session),
) -> Any:
    try:
        output_sats = _parse_amount_to_sats(req.amount, req.unit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    dest = req.destination_btc_address.strip()
    if not dest:
        raise HTTPException(status_code=400, detail="destination_btc_address is required")

    fee_rate = DEFAULT_SWAP_FEE_RATE_SAT_VB
    try:
        fee_rate = int(getattr(settings, "swap_fee_rate_sat_vb", DEFAULT_SWAP_FEE_RATE_SAT_VB) or DEFAULT_SWAP_FEE_RATE_SAT_VB)
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
        # Best effort: se falhar, mantém fee base configurada.
        pass

    # 1 input (o depósito principal) / 2 outputs (dest + troco).
    # Regra de negócio: fee mínima absoluta de 1000 sats.
    fee_est = max(_estimate_fee_sats(fee_rate, num_inputs=1, num_outputs=2), MIN_SWAP_FEE_SATS)
    required = output_sats + fee_est

    wallet = settings.bitcoin_operator_wallet.strip()
    if not wallet:
        raise HTTPException(
            status_code=503,
            detail="operator wallet not configured (BITCOIN_OPERATOR_WALLET)",
        )

    # Cria ordem primeiro para ter ID e usar no label do endereço.
    order = SwapOrder(
        output_sats=output_sats,
        destination_btc_address=dest,
        # Marcador único temporário até o bitcoind devolver o endereço real de depósito.
        deposit_btc_address=f"pending-{uuid4()}",
        required_deposit_sats=required,
        fee_rate_sat_vb=fee_rate,
        status="created",
        payout_txid=None,
        last_error=None,
    )
    session.add(order)
    await session.flush()  # atribui order.id
    await log_swap_step(
        session,
        order.id,
        "create_order",
        "order created with initial quote",
        {
            "output_sats": order.output_sats,
            "required_deposit_sats": order.required_deposit_sats,
            "fee_rate_sat_vb": order.fee_rate_sat_vb,
        },
    )

    try:
        await _ensure_wallet_loaded(wallet)
        addr = await rpc.call("getnewaddress", [f"swap-order-{order.id}", "bech32"], wallet=wallet)
    except Exception as exc:
        order.status = "error"
        order.last_error = f"failed to allocate deposit address: {exc}"
        await log_swap_step(
            session,
            order.id,
            "create_order.getnewaddress",
            "failed to allocate deposit address",
            {"error": str(exc)},
        )
        await session.commit()
        raise HTTPException(status_code=502, detail="failed to allocate deposit address") from exc

    order.deposit_btc_address = str(addr)
    order.status = "awaiting_deposit"
    await log_swap_step(
        session,
        order.id,
        "create_order.ready",
        "deposit address assigned",
        {"deposit_btc_address": order.deposit_btc_address},
    )
    await session.commit()

    return CreateOrderResponse(
        order_id=order.id,
        status=order.status,
        deposit_btc_address=order.deposit_btc_address,
        required_deposit_sats=order.required_deposit_sats,
        output_sats=order.output_sats,
        fee_rate_sat_vb=order.fee_rate_sat_vb,
        provider=order.provider or "internal",
    )


class GetOrderResponse(BaseModel):
    order_id: int
    status: str
    deposit_btc_address: str
    required_deposit_sats: int
    output_sats: int
    destination_btc_address: str
    payout_txid: str | None
    last_rpc_status: str | None
    provider: str = Field(default="internal")
    bitrefill_gift_card_line: str | None = None


async def _refresh_confirmation_if_needed(session: AsyncSession, order: SwapOrder) -> None:
    if order.status != "confirming" or not order.payout_txid:
        return
    wallet = settings.bitcoin_operator_wallet.strip()
    if not wallet:
        return
    try:
        tx = await rpc.call("gettransaction", [order.payout_txid], wallet=wallet)
    except Exception:
        return
    if not isinstance(tx, dict):
        return
    try:
        confs = int(tx.get("confirmations") or 0)
    except Exception:
        confs = 0
    if confs < 1:
        return
    order.status = "paid_out"
    order.last_error = None
    await log_swap_step(
        session,
        order.id,
        "order.confirmed",
        "payout transaction reached >=1 confirmation",
        {"payout_txid": order.payout_txid, "confirmations": confs},
    )


def _bitrefill_gift_card_line(br: SwapOrderBitrefill, payload: str | None) -> str | None:
    text = (payload or "").strip()
    if not text:
        return None
    label = (br.product_name_snapshot or "").strip() or (br.product_id or "").strip() or "produto escolhido"
    return f"Seu gift card de {label} é:\n{text}"


@router.get("/orders/{order_id}", response_model=GetOrderResponse)
async def get_order(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    demo_state: str | None = Query(
        None,
        description="Apenas signet + ordem Bitrefill: simula resposta GET nesse estado local.",
    ),
) -> Any:
    row = await session.execute(select(SwapOrder).where(SwapOrder.id == order_id))
    order = row.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")
    await _refresh_confirmation_if_needed(session, order)

    br: SwapOrderBitrefill | None = None
    redeem_for_line: str | None = None
    if (order.provider or "") == "bitrefill":
        res_b = await session.execute(
            select(SwapOrderBitrefill).where(SwapOrderBitrefill.swap_order_id == order.id)
        )
        br = res_b.scalar_one_or_none()
        if (
            br
            and order.status in {"confirming", "paid_out"}
            and (br.bitrefill_invoice_id or "").strip()
            and not (br.bitrefill_redeem_payload or "").strip()
        ):
            try:
                raw_inv = await bitrefill_get_invoice(br.bitrefill_invoice_id.strip())
                extracted = extract_redeem_payload_from_invoice(raw_inv)
                if extracted:
                    br.bitrefill_redeem_payload = extracted
                    await log_swap_step(
                        session,
                        order.id,
                        "bitrefill.redeem_sync",
                        "redeem data stored from Bitrefill invoice",
                        {"bitrefill_invoice_id": br.bitrefill_invoice_id},
                    )
            except BitrefillClientError as exc:
                await log_swap_step(
                    session,
                    order.id,
                    "bitrefill.redeem_sync",
                    "Bitrefill invoice fetch failed",
                    {"error": str(exc)[:512], "status_code": exc.status_code},
                )
        if br and (br.bitrefill_redeem_payload or "").strip():
            redeem_for_line = br.bitrefill_redeem_payload.strip()

    # Compatibilidade com ordens antigas: mensagens de progresso não são erro.
    if order.status in {"confirming", "paid_out"} and order.last_error:
        order.last_error = None
    await session.commit()
    gift_line = _bitrefill_gift_card_line(br, redeem_for_line) if br else None
    resp = GetOrderResponse(
        order_id=order.id,
        status=order.status,
        deposit_btc_address=order.deposit_btc_address,
        required_deposit_sats=order.required_deposit_sats,
        output_sats=order.output_sats,
        destination_btc_address=order.destination_btc_address,
        payout_txid=order.payout_txid,
        last_rpc_status=order.last_error,
        provider=order.provider or "internal",
        bitrefill_gift_card_line=gift_line,
    )

    raw_demo = (demo_state or "").strip()
    if raw_demo:
        normalized = normalize_bitrefill_demo_state(raw_demo)
        if normalized is None:
            raise HTTPException(
                status_code=422,
                detail=f"demo_state inválido. Use: {', '.join(BITREFILL_DEMO_STATES)}",
            )
        if not await chain_is_signet():
            raise HTTPException(
                status_code=422,
                detail="demo_state só é permitido quando o nó Bitcoin está em signet.",
            )
        if (order.provider or "") != "bitrefill":
            raise HTTPException(
                status_code=422,
                detail="demo_state aplica-se apenas a ordens Compras (provider=bitrefill).",
            )
        merged = bitrefill_get_order_demo_overlay(
            base=resp.model_dump(),
            demo_state=normalized,
            order_id=order.id,
        )
        return GetOrderResponse(**merged)

    return resp


class OrderLogEntry(BaseModel):
    id: int
    stage: str
    message: str | None
    details_json: str | None
    auxiliary_info: str | None
    created_at: str


@router.get("/orders/{order_id}/logs", response_model=list[OrderLogEntry])
async def get_order_logs(order_id: int, session: AsyncSession = Depends(get_session)) -> Any:
    q = await session.execute(
        select(SwapOrderLog)
        .where(SwapOrderLog.order_id == order_id)
        .order_by(SwapOrderLog.id.asc())
    )
    rows = q.scalars().all()
    return [
        OrderLogEntry(
            id=r.id,
            stage=r.stage,
            message=r.message,
            details_json=r.details_json,
            auxiliary_info=r.auxiliary_info,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


class ClientNetworkResponse(BaseModel):
    chain: str


@router.get("/network", response_model=ClientNetworkResponse)
async def get_client_network() -> Any:
    chain = (settings.bitcoin_network or "main").strip().lower()
    try:
        info = await rpc.call("getblockchaininfo")
        if isinstance(info, dict):
            rpc_chain = str(info.get("chain") or "").strip().lower()
            if rpc_chain:
                chain = rpc_chain
    except Exception:
        # Best effort: fallback para config local se RPC estiver indisponível.
        pass
    return ClientNetworkResponse(chain=chain)

