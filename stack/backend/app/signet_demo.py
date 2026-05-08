"""Utilitários para demo em Bitcoin Signet: respostas simuladas alinhadas aos DTOs reais.

O frontend chama os mesmos endpoints; com query ``demo_state`` e nó em signet, o GET
devolve o payload como se a ordem estivesse naquele estado (sem alterar a BD).
"""

from __future__ import annotations

import hashlib
import re
import struct
from decimal import Decimal
from typing import Any

from app.settings import settings

# Dados em OP_RETURN nas txs-gatilho signet: magic + big-endian uint64 order_id.
SIGNET_DEMO_OP_RETURN_MAGIC = b"BCSD"

BOLTZ_DEMO_STATES: tuple[str, ...] = (
    "awaiting_deposit",
    "deposit_detected",
    "provider_processing",
    "paid_out",
    "error",
)

BITREFILL_DEMO_STATES: tuple[str, ...] = (
    "awaiting_deposit",
    "deposit_detected",
    "provider_processing",
    "confirming",
    "paid_out",
    "error",
)

# Prefixo de ``boltz_swap_id`` em ``POST /client/boltz/orders`` (signet, sem API Boltz).
SIGNET_DEMO_BOLTZ_SWAP_PREFIX = "signet-demo-"

# status_raw coerentes com ``boltz_status_to_local`` em ``client_boltz``.
_BOLTZ_RAW_BY_LOCAL: dict[str, str] = {
    "awaiting_deposit": "invoice.set",
    "deposit_detected": "transaction.mempool",
    "provider_processing": "invoice.pending",
    "paid_out": "transaction.claimed",
    "error": "invoice.failedToPay",
}

# Preimage hex (32 bytes) só para UI / contrato de campo preenchido em ``paid_out`` demo.
_SIGNET_DEMO_PREIMAGE_HEX = "00" * 32

_DEMO_PAYOUT_DEST = "tb1qm0gehs7nge2ztns9u2wsevlnc3k6mffn5pn9ts"
SIGNET_DEMO_FORCE_FAIL_BOLTZ_INVOICE = (
    "lntb10u1pforcedfailpp5qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqdqqxqyjw5q9qtz"
)
SIGNET_DEMO_FORCE_FAIL_BITREFILL_PROVIDER_ID = "signet-demo-force-fail-games"


async def chain_is_signet() -> bool:
    from app.deps import rpc

    try:
        info = await rpc.call("getblockchaininfo")
        if isinstance(info, dict):
            return str(info.get("chain") or "").lower() == "signet"
    except Exception:
        pass
    return (settings.bitcoin_network or "").strip().lower() == "signet"


def is_signet_demo_boltz_swap_id(boltz_swap_id: str | None) -> bool:
    if not boltz_swap_id:
        return False
    return boltz_swap_id.startswith(SIGNET_DEMO_BOLTZ_SWAP_PREFIX)


def parse_bolt11_invoice_sats(invoice: str) -> int | None:
    """Extrai sats da parte amount da BOLT11 (mesma heurística que o frontend)."""

    lower = invoice.lower().strip()
    m = re.match(r"^ln(bc|tb|bcrt|tbs)(\d+)([munp])?1", lower)
    if not m:
        return None
    try:
        amount = int(m.group(2), 10)
    except ValueError:
        return None
    if amount <= 0:
        return None
    mult = m.group(3) or ""
    factors: dict[str, float] = {
        "": 100_000_000,
        "m": 100_000,
        "u": 100,
        "n": 0.1,
        "p": 0.0001,
    }
    factor = factors.get(mult)
    if factor is None:
        return None
    sats = int(round(amount * factor))
    return sats if sats > 0 else None


def is_signet_forced_fail_boltz_invoice(invoice: str | None) -> bool:
    raw = (invoice or "").strip().lower()
    if not raw:
        return False
    # QA pragmático: basta conter o marcador reservado, não precisa match 100% literal.
    return "pforcedfail" in raw


def demo_txid(seed: str) -> str:
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


def normalize_boltz_demo_state(raw: str | None) -> str | None:
    if raw is None or not str(raw).strip():
        return None
    s = str(raw).strip().lower()
    if s not in BOLTZ_DEMO_STATES:
        return None
    return s


def normalize_bitrefill_demo_state(raw: str | None) -> str | None:
    if raw is None or not str(raw).strip():
        return None
    s = str(raw).strip().lower()
    if s not in BITREFILL_DEMO_STATES:
        return None
    return s


def boltz_get_response_demo_overlay(
    *,
    base: dict[str, Any],
    demo_state: str,
    order_id: int,
) -> dict[str, Any]:
    """Sobrepõe campos do ``GetBoltzOrderResponse`` para o estado demo pedido."""

    out = dict(base)
    out["status"] = demo_state
    out["status_raw"] = _BOLTZ_RAW_BY_LOCAL.get(demo_state, "invoice.set")
    seed_base = f"signet-boltz-{order_id}"

    if demo_state == "awaiting_deposit":
        out["deposit_tx_id"] = None
        out["lockup_tx_id"] = None
        out["preimage"] = None
    elif demo_state == "deposit_detected":
        out["deposit_tx_id"] = demo_txid(f"{seed_base}-dep")
        out["lockup_tx_id"] = None
        out["preimage"] = None
    elif demo_state == "provider_processing":
        out["deposit_tx_id"] = demo_txid(f"{seed_base}-dep")
        out["lockup_tx_id"] = demo_txid(f"{seed_base}-lock")
        out["preimage"] = None
    elif demo_state == "paid_out":
        out["deposit_tx_id"] = demo_txid(f"{seed_base}-dep")
        out["lockup_tx_id"] = demo_txid(f"{seed_base}-lock")
        out["preimage"] = _SIGNET_DEMO_PREIMAGE_HEX
    elif demo_state == "error":
        out["deposit_tx_id"] = demo_txid(f"{seed_base}-dep") if out.get("deposit_tx_id") else None
        out["lockup_tx_id"] = None
        out["preimage"] = None

    return out


def bitrefill_get_order_demo_overlay(
    *,
    base: dict[str, Any],
    demo_state: str,
    order_id: int,
) -> dict[str, Any]:
    """Sobrepõe ``GetOrderResponse`` para ordens ``provider=bitrefill`` em signet."""

    out = dict(base)
    out["status"] = demo_state
    seed = f"signet-br-{order_id}"

    if demo_state == "awaiting_deposit":
        out["payout_txid"] = None
        out["last_rpc_status"] = None
        out["destination_btc_address"] = out.get("destination_btc_address") or _DEMO_PAYOUT_DEST
    elif demo_state == "deposit_detected":
        out["payout_txid"] = None
        out["last_rpc_status"] = "signet.demo: depósito detectado"
        out["destination_btc_address"] = _DEMO_PAYOUT_DEST
    elif demo_state == "provider_processing":
        out["payout_txid"] = None
        out["last_rpc_status"] = "signet.demo: invoice Bitrefill / payout pendente"
        out["destination_btc_address"] = _DEMO_PAYOUT_DEST
    elif demo_state == "confirming":
        out["payout_txid"] = demo_txid(f"{seed}-payout")
        out["last_rpc_status"] = "signet.demo: payout broadcast — aguardando confirmação"
        out["destination_btc_address"] = _DEMO_PAYOUT_DEST
    elif demo_state == "paid_out":
        out["payout_txid"] = demo_txid(f"{seed}-payout")
        out["last_rpc_status"] = None
        out["destination_btc_address"] = _DEMO_PAYOUT_DEST
        if not str(out.get("bitrefill_gift_card_line") or "").strip():
            out["bitrefill_gift_card_line"] = (
                f"Seu gift card de produto escolhido é:\nCódigo demo Signet: {demo_txid(f'gift-{order_id}')[:18].upper()}"
            )
    elif demo_state == "error":
        out["payout_txid"] = None
        out["last_rpc_status"] = "signet.demo: erro simulado na ordem"
        out["destination_btc_address"] = _DEMO_PAYOUT_DEST

    return out


def signet_demo_opreturn_payload_hex(order_id: int) -> str:
    """Hex para o campo ``data`` do output OP_RETURN (sem opcode/tamanho)."""

    return (SIGNET_DEMO_OP_RETURN_MAGIC + struct.pack(">Q", int(order_id))).hex()


def parse_signet_demo_order_id_from_decoded_tx(decoded: dict[str, Any]) -> int | None:
    for vo in decoded.get("vout", []) or []:
        if not isinstance(vo, dict):
            continue
        spk = vo.get("scriptPubKey")
        if not isinstance(spk, dict):
            continue
        if spk.get("type") != "nulldata":
            continue
        asm = str(spk.get("asm") or "")
        if not asm.startswith("OP_RETURN "):
            continue
        rest = asm[len("OP_RETURN ") :].strip().replace(" ", "")
        try:
            raw = bytes.fromhex(rest)
        except ValueError:
            continue
        magic_len = len(SIGNET_DEMO_OP_RETURN_MAGIC)
        if len(raw) < magic_len + 8 or raw[:magic_len] != SIGNET_DEMO_OP_RETURN_MAGIC:
            continue
        return struct.unpack(">Q", raw[magic_len : magic_len + 8])[0]
    return None


def sats_sent_to_address_in_decoded_tx(decoded: dict[str, Any], address: str) -> int:
    if not address.strip():
        return 0
    want = address.strip()
    total = 0
    for vo in decoded.get("vout", []) or []:
        if not isinstance(vo, dict):
            continue
        spk = vo.get("scriptPubKey")
        if not isinstance(spk, dict):
            continue
        addrs: list[str] = []
        inner = spk.get("address")
        if inner:
            addrs.append(str(inner))
        for a in spk.get("addresses", []) or []:
            if a:
                addrs.append(str(a))
        if want not in addrs:
            continue
        val = vo.get("value")
        if val is None:
            continue
        try:
            total += int((Decimal(str(val)) * Decimal(100_000_000)).to_integral_value())
        except Exception:
            continue
    return total


def signet_demo_verify_trigger_decoded(
    *,
    sink: str,
    order_id: int,
    required_deposit_sats: int,
    decoded: dict[str, Any],
) -> bool:
    if parse_signet_demo_order_id_from_decoded_tx(decoded) != int(order_id):
        return False
    return sats_sent_to_address_in_decoded_tx(decoded, sink) >= int(required_deposit_sats)


def schedule_signet_demo_task(coro: Any) -> None:
    """Agenda corrotina no loop em execução (ZMQ / swap processor)."""

    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(coro)


async def run_signet_boltz_demo_progression(order_id: int, _deposit_txid: str) -> None:
    """Após depósito real na demo Boltz signet: avança estados na BD (sem payout on-chain)."""

    import asyncio
    import json

    from sqlalchemy import select

    from app.db import get_session_factory
    from app.models import SwapOrder, SwapOrderBoltz
    from app.swap_logs import log_swap_step

    step = float(settings.signet_demo_progress_step_sec or 8.0)
    await asyncio.sleep(step)

    factory = get_session_factory()
    async with factory() as session:
        row = await session.execute(select(SwapOrder).where(SwapOrder.id == order_id))
        order = row.scalar_one_or_none()
        if order is None or order.status in {"paid_out", "error"}:
            return
        res_b = await session.execute(select(SwapOrderBoltz).where(SwapOrderBoltz.swap_order_id == order_id))
        boltz = res_b.scalar_one_or_none()
        order.status = "provider_processing"
        order.last_error = None
        if boltz:
            boltz.status_raw = "invoice.pending"
            payload = {
                "status": "invoice.pending",
                "transaction": {"id": demo_txid(f"signet-boltz-lock-{order_id}")},
                "preimage": None,
            }
            boltz.last_payload_json = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
            if is_signet_forced_fail_boltz_invoice(boltz.invoice_bolt11):
                order.last_error = "signet.demo: invoice reservada para falha forçada"
        await log_swap_step(
            session,
            order_id,
            "signet.demo.progress",
            "mock: provider_processing",
            {},
        )
        await session.commit()

    await asyncio.sleep(step)

    async with factory() as session:
        row = await session.execute(select(SwapOrder).where(SwapOrder.id == order_id))
        order = row.scalar_one_or_none()
        if order is None:
            return
        res_b = await session.execute(select(SwapOrderBoltz).where(SwapOrderBoltz.swap_order_id == order_id))
        boltz = res_b.scalar_one_or_none()
        force_fail = is_signet_forced_fail_boltz_invoice(boltz.invoice_bolt11 if boltz else None)
        if force_fail:
            order.status = "error"
            order.payout_txid = None
            order.last_error = "signet.demo: falha forçada por invoice de teste"
            if boltz:
                boltz.status_raw = "invoice.failedToPay"
            await log_swap_step(
                session,
                order_id,
                "signet.demo.progress",
                "mock: forced error (reserved invoice)",
                {},
            )
            await session.commit()
            return
        order.status = "paid_out"
        order.payout_txid = demo_txid(f"signet-boltz-payout-{order_id}")
        order.last_error = None
        if boltz:
            boltz.status_raw = "transaction.claimed"
            payload = {
                "status": "transaction.claimed",
                "transaction": {"id": demo_txid(f"signet-boltz-lock-{order_id}")},
                "preimage": _SIGNET_DEMO_PREIMAGE_HEX,
            }
            boltz.last_payload_json = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
        await log_swap_step(
            session,
            order_id,
            "signet.demo.progress",
            "mock: paid_out",
            {"payout_txid": order.payout_txid},
        )
        await session.commit()


async def run_signet_bitrefill_demo_progression(order_id: int, _deposit_txid: str) -> None:
    """Após depósito na demo Compras signet: avança estados sem invoice/payout reais Bitrefill."""

    import asyncio

    from sqlalchemy import select

    from app.db import get_session_factory
    from app.models import SwapOrder, SwapOrderBitrefill
    from app.swap_logs import log_swap_step

    step = float(settings.signet_demo_progress_step_sec or 8.0)
    await asyncio.sleep(step)

    factory = get_session_factory()
    async with factory() as session:
        row = await session.execute(select(SwapOrder).where(SwapOrder.id == order_id))
        order = row.scalar_one_or_none()
        if order is None or order.status in {"paid_out", "error"}:
            return
        order.status = "provider_processing"
        order.last_error = "signet.demo: invoice / payout simulados"
        await log_swap_step(session, order_id, "signet.demo.progress", "mock: provider_processing", {})
        await session.commit()

    await asyncio.sleep(step)

    async with factory() as session:
        row = await session.execute(select(SwapOrder).where(SwapOrder.id == order_id))
        order = row.scalar_one_or_none()
        if order is None:
            return
        if (order.provider_id or "").strip() == SIGNET_DEMO_FORCE_FAIL_BITREFILL_PROVIDER_ID:
            order.status = "error"
            order.payout_txid = None
            order.last_error = "signet.demo: categoria jogos configurada para falha forçada"
            await log_swap_step(
                session,
                order_id,
                "signet.demo.progress",
                "mock: forced error (bitrefill games)",
                {},
            )
            await session.commit()
            return
        order.status = "confirming"
        order.payout_txid = demo_txid(f"signet-br-payout-{order_id}")
        order.last_error = "signet.demo: payout simulado — aguardando confirmação"
        await log_swap_step(session, order_id, "signet.demo.progress", "mock: confirming", {})
        await session.commit()

    await asyncio.sleep(step)

    async with factory() as session:
        row = await session.execute(select(SwapOrder).where(SwapOrder.id == order_id))
        order = row.scalar_one_or_none()
        if order is None:
            return
        order.status = "paid_out"
        order.last_error = None
        res_b = await session.execute(
            select(SwapOrderBitrefill).where(SwapOrderBitrefill.swap_order_id == order_id)
        )
        br = res_b.scalar_one_or_none()
        if br:
            br.bitrefill_redeem_payload = (
                f"Código demo Signet: {demo_txid(f'signet-gift-{order_id}')[:18].upper()}"
            )
        await log_swap_step(session, order_id, "signet.demo.progress", "mock: paid_out", {})
        await session.commit()
