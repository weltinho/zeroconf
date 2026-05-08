"""Shared singletons used across HTTP/WebSocket handlers."""

from app.bitcoin_rpc import BitcoinRpcClient
from app.zmq_events import ZmqEventRelay

# Singleton RPC do Bitcoin Core.
# Reuso de conexão HTTP reduz latência/custo de handshake em chamadas frequentes.
rpc = BitcoinRpcClient()

# Relay ZMQ singleton (subscrição em tópicos do Core + broadcast via WebSocket).
# Recebe o `rpc` para filtro wallet-aware de hashtx.
zmq_relay = ZmqEventRelay(rpc)
