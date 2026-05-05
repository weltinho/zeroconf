from collections.abc import AsyncGenerator

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app import main
from app.routers.auth_adm import get_adm_user


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> AsyncGenerator[TestClient, None]:
    async def noop() -> None:
        return None

    monkeypatch.setattr(main.zmq_relay, "start", noop)
    monkeypatch.setattr(main.zmq_relay, "stop", noop)
    monkeypatch.setattr(main.rpc, "aclose", noop)

    main.app.dependency_overrides[get_adm_user] = lambda: {"sub": "test", "uid": 1}

    with TestClient(main.app) as test_client:
        yield test_client

    main.app.dependency_overrides.clear()


def test_health_returns_status_and_network(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "network": main.settings.bitcoin_network}


def test_adm_node_chain_returns_summary(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    expected = {
        "chain": "signet",
        "blocks": 100,
        "headers": 100,
        "verificationprogress": 1.0,
        "initialblockdownload": False,
    }

    async def fake_call(method: str, params=None, wallet=None):
        assert method == "getblockchaininfo"
        return expected

    monkeypatch.setattr(main.rpc, "call", fake_call)
    response = client.get("/adm/node/chain")

    assert response.status_code == 200
    body = response.json()
    assert body["chain"] == "signet"
    assert body["blocks"] == 100
    assert body["headers"] == 100


def test_adm_node_chain_maps_rpc_error(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_call(method: str, params=None, wallet=None):
        raise main.BitcoinRpcError("boom")

    monkeypatch.setattr(main.rpc, "call", fake_call)
    response = client.get("/adm/node/chain")

    assert response.status_code == 400
    assert "boom" in response.json()["detail"]


def test_adm_node_wallet_requires_operator_wallet_config(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(main.settings, "bitcoin_operator_wallet", "")
    response = client.get("/adm/node/wallet")

    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is False
    assert body["error"]


def test_adm_node_chain_requires_auth_without_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def noop() -> None:
        return None

    monkeypatch.setattr(main.zmq_relay, "start", noop)
    monkeypatch.setattr(main.zmq_relay, "stop", noop)
    monkeypatch.setattr(main.rpc, "aclose", noop)

    with TestClient(main.app) as raw_client:
        raw_client.app.state.db_ok = True
        response = raw_client.get("/adm/node/chain")

    assert response.status_code == 401


def test_websocket_rejected_when_zmq_disabled(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(main.settings, "zmq_enabled", False)

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/events") as websocket:
            websocket.receive_text()

    assert exc.value.code == 1008
