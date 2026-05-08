"""Poller para ordens Boltz ativas.

Consulta periodicamente GET /v2/swap/{id} para cada ordem com provider=boltz
em estado não-terminal, atualiza status local e grava logs técnicos.

Iniciado no lifespan da aplicação como asyncio.Task.
"""

from __future__ import annotations

import asyncio
import json
import logging

from sqlalchemy import select

from app.boltz_client import BoltzClientError, get_swap_status
from app.db import get_session_factory
from app.models import SwapOrder, SwapOrderBoltz
from app.routers.client_boltz import boltz_status_to_local
from app.settings import settings
from app.signet_demo import is_signet_demo_boltz_swap_id

logger = logging.getLogger(__name__)

# Intervalo entre ciclos completos de polling (segundos).
_POLL_INTERVAL_SEC = 30

# Estados terminais: ordens nestes estados não são mais consultadas.
_TERMINAL_STATUSES = frozenset({"paid_out", "error"})

# Ordem de progressão dos status locais: nunca regredir para um estado anterior.
_STATUS_RANK: dict[str, int] = {
    "awaiting_deposit": 0,
    "deposit_detected": 1,
    "provider_processing": 2,
    "paid_out": 3,
    "error": 3,
}


async def _poll_once() -> None:
    """Executa um ciclo de polling: consulta todas as ordens Boltz ativas."""
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(SwapOrder).where(
                SwapOrder.provider == "boltz",
                SwapOrder.status.notin_(list(_TERMINAL_STATUSES)),
            )
        )
        orders = result.scalars().all()

    if not orders:
        return

    logger.debug("Boltz poller: %d active order(s) to poll", len(orders))

    for order in orders:
        await _poll_order(order.id, order.provider_id)


async def _poll_order(order_id: int, boltz_swap_id: str | None) -> None:
    """Consulta status de uma única ordem Boltz e atualiza BD se houve mudança."""
    if is_signet_demo_boltz_swap_id(boltz_swap_id):
        return
    if not boltz_swap_id:
        logger.warning("Boltz order %d has no provider_id, skipping poll", order_id)
        return

    try:
        status_data = await get_swap_status(boltz_swap_id)
    except BoltzClientError as exc:
        logger.warning("Boltz poll failed for swap %s (order %d): %s", boltz_swap_id, order_id, exc)
        return

    status_raw: str | None = status_data.get("status")
    new_local_status = boltz_status_to_local(status_raw)
    payload_json = json.dumps(status_data, ensure_ascii=True, separators=(",", ":"))

    # Se a Boltz retornou preimage, a invoice foi definitivamente paga.
    if status_data.get("preimage"):
        new_local_status = "paid_out"

    factory = get_session_factory()
    async with factory() as session:
        # Relê a ordem dentro da sessão para ter estado atualizado.
        result = await session.execute(
            select(SwapOrder).where(SwapOrder.id == order_id)
        )
        order = result.scalar_one_or_none()
        if order is None:
            return

        result_boltz = await session.execute(
            select(SwapOrderBoltz).where(SwapOrderBoltz.swap_order_id == order_id)
        )
        boltz_detail = result_boltz.scalar_one_or_none()

        status_changed = (order.status != new_local_status) or (
            boltz_detail and boltz_detail.status_raw != status_raw
        )

        if boltz_detail:
            boltz_detail.status_raw = status_raw
            boltz_detail.last_payload_json = payload_json

        if order.status != new_local_status:
            # Não regredir para status menos avançado (ex.: transaction.confirmed
            # não deve voltar de provider_processing para deposit_detected).
            current_rank = _STATUS_RANK.get(order.status, 0)
            new_rank = _STATUS_RANK.get(new_local_status, 0)
            if new_rank < current_rank:
                logger.debug(
                    "Boltz order %d: ignorando regressão de status %s -> %s (raw: %s)",
                    order_id, order.status, new_local_status, status_raw,
                )
            else:
                logger.info(
                    "Boltz order %d: %s -> %s (raw: %s)",
                    order_id,
                    order.status,
                    new_local_status,
                    status_raw,
                )

                if new_local_status == "error":
                    failure_reason = status_data.get("failureReason", "")
                    order.last_error = f"Boltz: {status_raw}" + (
                        f" — {failure_reason}" if failure_reason else ""
                    )

                order.status = new_local_status

        if status_changed:
            await log_swap_step(
                session,
                order_id,
                f"boltz.poll.{status_raw or 'unknown'}",
                f"Boltz status update: {status_raw} -> local: {new_local_status}",
                {"boltz_swap_id": boltz_swap_id, "status_raw": status_raw},
            )

        await session.commit()


async def run_boltz_poller() -> None:
    """Loop principal do poller. Roda indefinidamente até cancelamento."""
    logger.info("Boltz poller started (interval=%ds)", _POLL_INTERVAL_SEC)
    while True:
        try:
            await _poll_once()
        except asyncio.CancelledError:
            logger.info("Boltz poller cancelled")
            raise
        except Exception:
            logger.exception("Boltz poller unexpected error in cycle")
        await asyncio.sleep(_POLL_INTERVAL_SEC)
