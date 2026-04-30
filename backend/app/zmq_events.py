import asyncio
import contextlib
from typing import Any

import zmq
import zmq.asyncio
from fastapi import WebSocket

from app.settings import settings


class ZmqEventRelay:
    def __init__(self) -> None:
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

    async def start(self) -> None:
        # Evita iniciar duas vezes e respeita feature flag.
        if self._task or not settings.zmq_enabled:
            return

        # Cria socket subscriber (SUB) e conecta no endpoint PUB do bitcoind.
        socket = self._context.socket(zmq.SUB)
        socket.connect(settings.bitcoin_zmq_endpoint)
        # Assina cada tópico configurado (hashblock, hashtx, raw*, sequence, ...).
        for topic in settings.bitcoin_zmq_topic_list:
            socket.setsockopt(zmq.SUBSCRIBE, topic.encode("ascii"))

        self._socket = socket
        # Inicia loop de leitura assíncrono sem bloquear startup da API.
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        # Cancela task de consumo do ZMQ com tratamento de cancelamento esperado.
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

        # Fecha socket imediatamente (linger=0 evita esperar flush pendente).
        if self._socket:
            self._socket.close(linger=0)
            self._socket = None

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

    async def _run(self) -> None:
        # Sem socket ativo, não há o que consumir.
        if not self._socket:
            return

        # Loop infinito de consumo dos frames multipart do ZMQ.
        while True:
            frames = await self._socket.recv_multipart()
            event = self._to_event(frames)
            await self._broadcast(event)

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
