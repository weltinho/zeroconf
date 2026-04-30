from collections.abc import AsyncGenerator

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app import main


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> AsyncGenerator[TestClient, None]:
    async def noop() -> None:
        return None

    # Evita iniciar componentes reais (ZMQ/HTTP) durante testes de rota.
    monkeypatch.setattr(main.zmq_relay, "start", noop)
    monkeypatch.setattr(main.zmq_relay, "stop", noop)
    monkeypatch.setattr(main.rpc, "aclose", noop)

    with TestClient(main.app) as test_client:
        yield test_client


def test_health_returns_status_and_network(client: TestClient) -> None:
    # Verifica contrato básico do health check da API.
    # Não fixa rede específica (signet/regtest/mainnet/testnet), apenas valida consistência.
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "network": main.settings.bitcoin_network}


def test_rpc_passthrough_success(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # Garante que o endpoint REST /rpc/{method} repassa o método ao cliente RPC
    # e devolve o resultado no formato padronizado da API.
    expected = {"chain": "any-network"}

    async def fake_call(
        method: str, params: list[object] | None = None, wallet: str | None = None
    ):
        assert method == "getblockchaininfo"
        assert params is None
        assert wallet is None
        return expected

    monkeypatch.setattr(main.rpc, "call", fake_call)
    response = client.get("/rpc/getblockchaininfo")

    assert response.status_code == 200
    assert response.json() == {"method": "getblockchaininfo", "wallet": None, "result": expected}


def test_rpc_passthrough_jsonrpc_error(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Quando o bitcoind responde erro lógico JSON-RPC, a API deve mapear para 400.
    async def fake_call(
        method: str, params: list[object] | None = None, wallet: str | None = None
    ):
        raise main.BitcoinRpcError("Method not found")

    monkeypatch.setattr(main.rpc, "call", fake_call)
    response = client.get("/rpc/invalidmethod")

    assert response.status_code == 400
    assert "Method not found" in response.json()["detail"]


def test_rpc_passthrough_transport_error(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Quando há falha de infraestrutura/transporte (rede, indisponibilidade),
    # a API deve retornar 502 para sinalizar dependência externa indisponível.
    async def fake_call(
        method: str, params: list[object] | None = None, wallet: str | None = None
    ):
        raise RuntimeError("network down")

    monkeypatch.setattr(main.rpc, "call", fake_call)
    response = client.get("/rpc/getblockchaininfo")

    assert response.status_code == 502
    assert "RPC unavailable" in response.json()["detail"]


def test_rpc_post_passthrough_with_params(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # POST /rpc/{method} deve encaminhar params JSON-RPC ao cliente de backend.
    expected = {"ok": True}

    async def fake_call(
        method: str, params: list[object] | None = None, wallet: str | None = None
    ):
        assert method == "getblockhash"
        assert params == [1]
        assert wallet is None
        return expected

    monkeypatch.setattr(main.rpc, "call", fake_call)
    response = client.post("/rpc/getblockhash", json={"params": [1]})

    assert response.status_code == 200
    assert response.json() == {
        "method": "getblockhash",
        "wallet": None,
        "params": [1],
        "result": expected,
    }


def test_rpc_get_passthrough_with_wallet_query(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # GET /rpc/{method}?wallet=... deve repassar contexto de wallet ao cliente RPC.
    expected = "bcrt1qexample"

    async def fake_call(
        method: str, params: list[object] | None = None, wallet: str | None = None
    ):
        assert method == "getnewaddress"
        assert params is None
        assert wallet == "student-wallet"
        return expected

    monkeypatch.setattr(main.rpc, "call", fake_call)
    response = client.get("/rpc/getnewaddress?wallet=student-wallet")

    assert response.status_code == 200
    assert response.json() == {
        "method": "getnewaddress",
        "wallet": "student-wallet",
        "result": expected,
    }


def test_rpc_post_passthrough_with_wallet_query(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # POST /rpc/{method}?wallet=... deve repassar params + wallet corretamente.
    expected = ["0000000abc..."]

    async def fake_call(method: str, params: list[object] | None = None, wallet: str | None = None):
        assert method == "generatetoaddress"
        assert params == [1, "bcrt1qexample"]
        assert wallet == "student-wallet"
        return expected

    monkeypatch.setattr(main.rpc, "call", fake_call)
    response = client.post(
        "/rpc/generatetoaddress?wallet=student-wallet",
        json={"params": [1, "bcrt1qexample"]},
    )

    assert response.status_code == 200
    assert response.json() == {
        "method": "generatetoaddress",
        "wallet": "student-wallet",
        "params": [1, "bcrt1qexample"],
        "result": expected,
    }


def test_websocket_rejected_when_zmq_disabled(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Com feature flag de ZMQ desligada, a conexão WS deve ser recusada (policy).
    monkeypatch.setattr(main.settings, "zmq_enabled", False)

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/events") as websocket:
            # Alguns ambientes só propagam o close ao tentar ler/escrever no socket.
            websocket.receive_text()

    assert exc.value.code == 1008
