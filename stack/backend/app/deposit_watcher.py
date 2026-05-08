"""Watcher assíncrono para detectar depósitos sem depender de evento HTTP/ZMQ.

Vasculha periodicamente ordens ativas e tenta processar payout quando houver UTXO
no endereço de depósito da ordem.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.db import get_session_factory
from app.models import SwapOrder
from app.routers.node import _ensure_wallet_loaded
from app.settings import settings
from app.swap_processor import SwapOrderProcessor

logger = logging.getLogger(__name__)

_DEPOSIT_WATCH_INTERVAL_SEC = 5
_WATCH_STATUSES = ("awaiting_deposit", "processing", "deposit_detected", "provider_processing")


async def _scan_once(processor: SwapOrderProcessor) -> None:
    wallet = settings.bitcoin_operator_wallet.strip()
    if not wallet:
        return

    await _ensure_wallet_loaded(wallet)

    factory = get_session_factory()
    async with factory() as session:
        rows = await session.execute(
            select(SwapOrder.id).where(
                SwapOrder.status.in_(_WATCH_STATUSES),
                SwapOrder.payout_txid.is_(None),
            )
        )
        order_ids = [int(v) for v in rows.scalars().all()]

    if not order_ids:
        return

    for order_id in order_ids:
        async with factory() as session:
            row = await session.execute(select(SwapOrder).where(SwapOrder.id == order_id))
            order = row.scalar_one_or_none()
            if order is None:
                continue
            if order.payout_txid:
                continue
            dep = (order.deposit_btc_address or "").strip()
            if not dep:
                continue

            # Best effort: extrai txid do primeiro UTXO para rastreamento no log.
            event_txid: str | None = None
            try:
                unspent = await processor._rpc.call(  # noqa: SLF001 - uso interno controlado
                    "listunspent",
                    [0, 9999999, [dep], True],
                    wallet=wallet,
                )
                if isinstance(unspent, list) and unspent:
                    event_txid = str(unspent[0].get("txid") or "").strip() or None
            except Exception:
                # _try_payout_order já trata erro de listunspent com detalhe em last_error.
                pass

            await processor._try_payout_order(session, wallet, order, event_txid=event_txid)  # noqa: SLF001
            await session.commit()


async def run_deposit_watcher(processor: SwapOrderProcessor) -> None:
    """Loop principal de detecção de depósitos por polling RPC."""
    logger.info("Deposit watcher started (interval=%ds)", _DEPOSIT_WATCH_INTERVAL_SEC)
    while True:
        try:
            await _scan_once(processor)
        except asyncio.CancelledError:
            logger.info("Deposit watcher cancelled")
            raise
        except Exception:
            logger.exception("Deposit watcher unexpected error in cycle")
        await asyncio.sleep(_DEPOSIT_WATCH_INTERVAL_SEC)
