import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.bitcoin_rpc import BitcoinRpcError
from app.deps import rpc, zmq_relay
from app.routers import (
    auth_adm,
    client as client_router,
    events as events_router,
    health,
    node as node_router,
    swaps_adm as swaps_adm_router,
)
from app.routers.client_boltz import router as client_boltz_router
from app.routers.client_bitrefill import router as client_bitrefill_router
from app.settings import settings
from app.swap_processor import SwapOrderProcessor

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_ok = False
    try:
        from app.bootstrap_adm import bootstrap_admin_if_empty
        from app.db import dispose_engine, get_session_factory, run_db_migrations

        # 1) Alembic aplica `alembic/versions/*` (ex.: CREATE TABLE adm_users).
        # 2) Bootstrap opcional: primeiro utilizador admin se a tabela estiver vazia.
        t0 = time.perf_counter()
        await run_db_migrations()
        logger.info("Arranque: migrations Alembic em %.2fs", time.perf_counter() - t0)

        t1 = time.perf_counter()
        factory = get_session_factory()
        async with factory() as session:
            await bootstrap_admin_if_empty(session)
        logger.info("Arranque: bootstrap admin em %.2fs", time.perf_counter() - t1)

        app.state.db_ok = True
    except Exception:
        logger.exception(
            "Falha ao inicializar MariaDB — login admin desactivado até a BD estar disponível."
        )
        try:
            from app.db import dispose_engine as _dispose

            await _dispose()
        except Exception:
            logger.exception("dispose_engine após falha de BD")

    # ZMQ em task paralela: não atrasa o primeiro `yield` (bind HTTP / aceitar pedidos).
    # Também registra processadores internos (ex.: swap orders) no stream hashtx.
    try:
        zmq_relay.add_hashtx_listener(SwapOrderProcessor(rpc).handle_hashtx)
    except Exception:
        logger.exception("Falha ao registrar SwapOrderProcessor no relay ZMQ")

    zmq_task = asyncio.create_task(zmq_relay.start())

    def _zmq_done(t: asyncio.Task[None]) -> None:
        try:
            t.result()
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Falha ao iniciar relay ZMQ")

    zmq_task.add_done_callback(_zmq_done)

    # Boltz poller: monitora ordens ativas periodicamente (apenas se habilitado).
    boltz_poll_task: asyncio.Task[None] | None = None
    if settings.boltz_enabled:
        from app.boltz_poller import run_boltz_poller

        boltz_poll_task = asyncio.create_task(run_boltz_poller())

        def _boltz_poller_done(t: asyncio.Task[None]) -> None:
            try:
                t.result()
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("Boltz poller encerrou com erro")

        boltz_poll_task.add_done_callback(_boltz_poller_done)

    yield

    if boltz_poll_task is not None:
        boltz_poll_task.cancel()
        try:
            await boltz_poll_task
        except asyncio.CancelledError:
            pass

    await zmq_relay.stop()
    await rpc.aclose()
    try:
        from app.db import dispose_engine as _dispose_end

        await _dispose_end()
    except Exception:
        logger.exception("dispose_engine no shutdown")


app = FastAPI(
    title="ZeroConf API",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(auth_adm.router)
app.include_router(client_router.router)
app.include_router(client_boltz_router)
app.include_router(client_bitrefill_router)
app.include_router(node_router.router)
app.include_router(swaps_adm_router.router)
app.include_router(events_router.router)

# Re-export for tests and monkeypatching (same objects as app.deps).
__all__ = ["app", "rpc", "zmq_relay", "settings", "BitcoinRpcError"]
