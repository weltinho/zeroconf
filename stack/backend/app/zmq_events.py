import asyncio
import contextlib
import time
from typing import Any, Callable

import zmq
import zmq.asyncio
from fastapi import WebSocket

from app.bitcoin_rpc import BitcoinRpcClient, BitcoinRpcError
from app.settings import settings


class ZmqEventRelay:
    def __init__(self, rpc_client: BitcoinRpcClient | None = None) -> None:
        # Contexto asyncio do ZMQ (integra com loop async do FastAPI/Uvicorn).
        self._context = zmq.asyncio.Context()
        # Socket SUB (subscriber) para ouvir tópicos do bitcoind.
        self._socket: zmq.asyncio.Socket | None = None
        # Task de background que fica lendo frames do ZMQ.
        self._task: asyncio.Task[None] | None = None
        # Conjunto de clientes WebSocket conectados para broadcast.
        self._clients: set[WebSocket] = set()
        # Lock evita condição de corrida ao adicionar/remover clientes.
        self._clients_lock = asyncio.Lock()
        # RPC para filtro wallet-aware de hashtx (opcional em testes).
        self._rpc = rpc_client
        # Cache txid -> (epoch_monotonic, relevante_para_wallet)
        self._tx_relevance_cache: dict[str, tuple[float, bool]] = {}
        self._tx_filter_sem = asyncio.Semaphore(settings.zmq_wallet_filter_max_concurrency)
        # Tarefas em voo para filtro wallet-aware de hashtx.
        self._pending_hashtx_tasks: set[asyncio.Task[None]] = set()
        # Callbacks internas (ex.: processadores de domínio) para hashtx relevante.
        self._hashtx_listeners: set[callable[[str], "asyncio.Future[None]"]] = set()
        # Sinais simples de observabilidade do relay.
        self._running = False
        self._last_event_at_epoch: float | None = None
        self._last_event_topic: str | None = None

    async def start(self) -> None:
        # Evita iniciar duas vezes e respeita feature flag.
        if self._task or not settings.zmq_enabled:
            return

        # Cria socket subscriber (SUB) e conecta no endpoint PUB do bitcoind.
        socket = self._context.socket(zmq.SUB)
        socket.connect(settings.bitcoin_zmq_endpoint)
        # Assina cada tópico configurado (hashblock, hashtx, raw*, sequence, ...).
        for topic in settings.bitcoin_zmq_relay_topic_list:
            socket.setsockopt(zmq.SUBSCRIBE, topic.encode("ascii"))

        self._socket = socket
        # Inicia loop de leitura assíncrono sem bloquear startup da API.
        self._task = asyncio.create_task(self._run())
        self._running = True

    async def stop(self) -> None:
        # Cancela task de consumo do ZMQ com tratamento de cancelamento esperado.
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        self._running = False

        # Fecha socket imediatamente (linger=0 evita esperar flush pendente).
        if self._socket:
            self._socket.close(linger=0)
            self._socket = None

        # Cancela tarefas pendentes de filtro hashtx.
        if self._pending_hashtx_tasks:
            for task in list(self._pending_hashtx_tasks):
                task.cancel()
            with contextlib.suppress(Exception):
                await asyncio.gather(*self._pending_hashtx_tasks, return_exceptions=True)
            self._pending_hashtx_tasks.clear()

        # Copia clientes atuais e limpa estrutura protegida por lock.
        async with self._clients_lock:
            clients = list(self._clients)
            self._clients.clear()

        # Fecha conexões WebSocket abertas sem derrubar shutdown em erro pontual.
        for client in clients:
            with contextlib.suppress(Exception):
                await client.close()

        # Libera contexto ZMQ.
        self._context.term()

    async def add_client(self, websocket: WebSocket) -> None:
        # Registra cliente para receber eventos de broadcast.
        async with self._clients_lock:
            self._clients.add(websocket)

    async def remove_client(self, websocket: WebSocket) -> None:
        # Remove cliente de forma segura; discard não falha se já não existir.
        async with self._clients_lock:
            self._clients.discard(websocket)

    def add_hashtx_listener(self, listener: "Callable[[str], asyncio.Future[None]]") -> None:
        self._hashtx_listeners.add(listener)

    def remove_hashtx_listener(self, listener: "Callable[[str], asyncio.Future[None]]") -> None:
        self._hashtx_listeners.discard(listener)

    async def _run(self) -> None:
        # Sem socket ativo, não há o que consumir.
        if not self._socket:
            return

        # Loop infinito de consumo dos frames multipart do ZMQ.
        while True:
            frames = await self._socket.recv_multipart()
            raw = self._to_event(frames)
            self._last_event_at_epoch = time.time()
            self._last_event_topic = str(raw.get("topic") or "") or None
            if raw.get("topic") == "hashtx" and settings.zmq_filter_wallet_txs_only:
                if len(self._pending_hashtx_tasks) >= settings.zmq_wallet_filter_max_pending:
                    # Proteção anti-burst: descarta excesso para não acumular backlog infinito.
                    continue
                task = asyncio.create_task(self._handle_hashtx(raw))
                self._pending_hashtx_tasks.add(task)
                task.add_done_callback(lambda t: self._pending_hashtx_tasks.discard(t))
                continue
            event = self._shape_for_operator(raw)
            await self._broadcast(event)

    def status_snapshot(self) -> dict[str, Any]:
        # Consumido por /adm/node/health-summary para observabilidade do canal ZMQ.
        return {
            "running": self._running,
            "connected_subscriber": self._socket is not None and self._running,
            "last_event_at_epoch": self._last_event_at_epoch,
            "last_event_topic": self._last_event_topic,
            "clients_count": len(self._clients),
        }

    async def _handle_hashtx(self, raw: dict[str, Any]) -> None:
        txid = self._extract_txid(raw)
        if not txid:
            return
        is_relevant = await self._is_wallet_relevant_txid(txid)
        if not is_relevant:
            return
        # Notifica listeners internos (best effort; não deve derrubar relay).
        # Ex.: SwapOrderProcessor, que reage a depósitos antes da confirmação.
        if self._hashtx_listeners:
            for listener in list(self._hashtx_listeners):
                try:
                    asyncio.create_task(listener(txid))
                except Exception:
                    # Listener mal comportado não deve quebrar o relay.
                    pass
        event = self._shape_for_operator(raw)
        await self._broadcast(event)

    @staticmethod
    def _extract_txid(raw: dict[str, Any]) -> str:
        ph = raw.get("payload_hex")
        if not isinstance(ph, str):
            return ""
        return ph[:64] if len(ph) >= 64 else ph

    async def _is_wallet_relevant_txid(self, txid: str) -> bool:
        """Retorna True se a tx pertence à carteira do operador configurada."""
        wallet = settings.bitcoin_operator_wallet.strip()
        if not wallet:
            return False
        if not self._rpc:
            return False

        now = time.monotonic()
        cached = self._tx_relevance_cache.get(txid)
        if cached and (now - cached[0]) <= settings.zmq_wallet_filter_cache_ttl_sec:
            return cached[1]

        relevant = False
        async with self._tx_filter_sem:
            try:
                # gettransaction só encontra tx que tocam esta carteira.
                await self._rpc.call("gettransaction", [txid], wallet=wallet)
                relevant = True
            except BitcoinRpcError as exc:
                # Tx não pertence à wallet (erro esperado no filtro).
                msg = str(exc)
                if "RPC error -5" in msg or "Invalid or non-wallet transaction id" in msg:
                    relevant = False
                else:
                    # Outros erros (wallet não carregada, etc.) não explodem o relay.
                    relevant = False
            except Exception:
                # Falha de rede/transporte: fail-closed para evitar ruído.
                relevant = False

        self._tx_relevance_cache[txid] = (now, relevant)
        # Limpeza simples para evitar crescimento indefinido.
        if len(self._tx_relevance_cache) > 4000:
            cutoff = now - settings.zmq_wallet_filter_cache_ttl_sec
            self._tx_relevance_cache = {
                k: v for k, v in self._tx_relevance_cache.items() if v[0] >= cutoff
            }
        return relevant

    @staticmethod
    def _to_event(frames: list[bytes]) -> dict[str, Any]:
        # Formato usual do Core: tópico (ascii), corpo, contador 4-byte LE (ver doc/zmq.md).
        topic = frames[0].decode("ascii")
        if len(frames) < 2:
            return {"topic": topic, "payload_hex": None, "sequence": None}

        bodies = frames[1:]
        payload_hex = bodies[0].hex()
        sequence: int | None = None
        middle_hex: list[str] | None = None
        rest_hex: list[str] | None = None

        if len(bodies) >= 2:
            trailing = bodies[-1]
            if len(trailing) == 4:
                sequence = int.from_bytes(trailing, byteorder="little")
                if len(bodies) > 2:
                    middle_hex = [b.hex() for b in bodies[1:-1]]
            else:
                rest_hex = [b.hex() for b in bodies[1:]]

        event: dict[str, Any] = {
            "topic": topic,
            "payload_hex": payload_hex,
            "sequence": sequence,
        }
        if middle_hex:
            event["middle_hex"] = middle_hex
        if rest_hex:
            event["rest_hex"] = rest_hex
        return event

    @staticmethod
    def _shape_for_operator(raw: dict[str, Any]) -> dict[str, Any]:
        """Converte o frame ZMQ bruto num resumo para a consola do nó (sem reenviar hex enorme)."""
        topic = str(raw.get("topic") or "")
        seq = raw.get("sequence")
        ph = (raw.get("payload_hex") or "") if isinstance(raw.get("payload_hex"), str) else ""

        base: dict[str, Any] = {
            "topic": topic,
            "tipo": "resumo_operador",
        }
        if seq is not None:
            base["sequencia_zmq"] = seq

        if topic == "hashblock":
            h = ph[:64] if ph else ""
            base["resumo"] = "Novo bloco: aviso hashblock (32 B) publicado por este nó."
            base["hash_do_bloco"] = h
            return base

        if topic == "sequence":
            base["resumo"] = (
                "Sequence: atualização de mempool / scripts monitorizados neste Bitcoin Core."
            )
            max_chars = 240
            det = ph[:max_chars] + ("…" if len(ph) > max_chars else "")
            base["detalhe_hex_curto"] = det if ph else None
            return base

        if topic == "hashtx":
            base["resumo"] = (
                "Transação relevante para a carteira do operador (txid de 32 B; sem raw completo)."
            )
            base["txid"] = ph[:64] if len(ph) >= 64 else ph
            # Quando chega aqui, passou pelo filtro wallet-aware (se habilitado).
            base["wallet_relevante"] = True
            return base

        if topic == "rawtx":
            nb = len(ph) // 2 if ph else 0
            base["resumo"] = (
                "Transação raw não exibida na consola — use getrawtransaction / decoderawtransaction (RPC)."
            )
            base["tamanho_estimado_bytes"] = nb
            return base

        if topic == "rawblock":
            nb = len(ph) // 2 if ph else 0
            base["resumo"] = (
                "Bloco raw não exibido na consola — use getblock com a verbosidade adequada (RPC)."
            )
            base["tamanho_estimado_bytes"] = nb
            return base

        base["resumo"] = "Evento ZMQ deste nó (formato não mapeado)."
        base["detalhe_compacto"] = ph[:120] + ("…" if len(ph) > 120 else "") if ph else None
        return base

    async def _broadcast(self, event: dict[str, Any]) -> None:
        # Snapshot para não segurar lock durante I/O de rede.
        async with self._clients_lock:
            clients = list(self._clients)

        # Sem clientes conectados, ignora evento silenciosamente.
        if not clients:
            return

        # Guarda clientes que falharem no send para limpeza posterior.
        stale_clients: list[WebSocket] = []
        for client in clients:
            try:
                await client.send_json(event)
            except Exception:
                # Cliente desconectado/instável: marca para remoção.
                stale_clients.append(client)

        if not stale_clients:
            return

        # Remove conexões quebradas para não tentar enviar novamente.
        async with self._clients_lock:
            for client in stale_clients:
                self._clients.discard(client)
