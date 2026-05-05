import pytest

from app.zmq_events import ZmqEventRelay


class DummyWebSocket:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.messages: list[dict[str, object]] = []

    async def send_json(self, event: dict[str, object]) -> None:
        if self.fail:
            raise RuntimeError("broken websocket")
        self.messages.append(event)


def test_to_event_decodes_topic_payload_and_sequence() -> None:
    # Valida a transformação de frames ZMQ brutos em evento JSON serializável.
    topic = b"hashblock"
    payload = bytes.fromhex("deadbeef")
    sequence = (7).to_bytes(4, byteorder="little")

    event = ZmqEventRelay._to_event([topic, payload, sequence])

    assert event["topic"] == "hashblock"
    assert event["payload_hex"] == "deadbeef"
    assert event["sequence"] == 7


def test_to_event_multipart_with_middle_hex_when_trailing_sequence() -> None:
    topic = b"custom"
    a = b"aa"
    b_ = b"bb"
    seq = (99).to_bytes(4, byteorder="little")
    event = ZmqEventRelay._to_event([topic, a, b_, seq])
    assert event["topic"] == "custom"
    assert event["payload_hex"] == a.hex()
    assert event["sequence"] == 99
    assert event["middle_hex"] == [b_.hex()]


def test_shape_for_operator_hashblock_drops_raw_hex_flood() -> None:
    raw = {
        "topic": "hashblock",
        "payload_hex": "aa" * 32,
        "sequence": 42,
    }
    out = ZmqEventRelay._shape_for_operator(raw)
    assert out["topic"] == "hashblock"
    assert out["tipo"] == "resumo_operador"
    assert out["hash_do_bloco"] == "aa" * 32
    assert out["sequencia_zmq"] == 42
    assert "resumo" in out
    assert "payload_hex" not in out


def test_to_event_rest_hex_when_trailing_not_four_bytes() -> None:
    topic = b"x"
    event = ZmqEventRelay._to_event([topic, b"ab", b"cd", b"ef"])
    assert event["topic"] == "x"
    assert event["payload_hex"] == "6162"
    assert event["sequence"] is None
    assert event["rest_hex"] == [b"cd".hex(), b"ef".hex()]


@pytest.mark.asyncio
async def test_broadcast_sends_to_all_connected_clients() -> None:
    # Garante fan-out: um evento recebido deve ser enviado para todos clientes ativos.
    relay = ZmqEventRelay()
    ok_client_1 = DummyWebSocket()
    ok_client_2 = DummyWebSocket()
    relay._clients = {ok_client_1, ok_client_2}
    event = {"topic": "hashblock", "payload_hex": "00", "sequence": 1}

    await relay._broadcast(event)

    assert ok_client_1.messages == [event]
    assert ok_client_2.messages == [event]


@pytest.mark.asyncio
async def test_broadcast_removes_stale_clients_after_send_failure() -> None:
    # Se um cliente falha no envio, ele deve ser removido para evitar novas tentativas.
    relay = ZmqEventRelay()
    ok_client = DummyWebSocket()
    stale_client = DummyWebSocket(fail=True)
    relay._clients = {ok_client, stale_client}

    await relay._broadcast({"topic": "hashtx", "payload_hex": "01", "sequence": 2})

    assert ok_client in relay._clients
    assert stale_client not in relay._clients
