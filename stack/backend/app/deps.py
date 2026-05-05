"""Shared singletons used across HTTP/WebSocket handlers."""

from app.bitcoin_rpc import BitcoinRpcClient
from app.zmq_events import ZmqEventRelay

rpc = BitcoinRpcClient()
zmq_relay = ZmqEventRelay(rpc)
