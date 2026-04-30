import httpx
import pytest

from app.bitcoin_rpc import BitcoinRpcClient, BitcoinRpcError
from app.settings import settings


@pytest.mark.asyncio
async def test_call_raises_jsonrpc_error_even_on_http_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = BitcoinRpcClient()

    async def fake_post(*args, **kwargs) -> httpx.Response:
        request = httpx.Request("POST", settings.rpc_url)
        return httpx.Response(
            500,
            json={
                "result": None,
                "error": {
                    "code": -18,
                    "message": "Requested wallet does not exist or is not loaded",
                },
                "id": 1,
            },
            request=request,
        )

    monkeypatch.setattr(client._client, "post", fake_post)

    with pytest.raises(BitcoinRpcError) as exc:
        await client.call("getnewaddress")

    assert "RPC error -18" in str(exc.value)
    assert "wallet" in str(exc.value).lower()
    await client.aclose()


@pytest.mark.asyncio
async def test_call_raises_http_error_when_no_jsonrpc_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = BitcoinRpcClient()

    async def fake_post(*args, **kwargs) -> httpx.Response:
        request = httpx.Request("POST", settings.rpc_url)
        return httpx.Response(502, text="bad gateway", request=request)

    monkeypatch.setattr(client._client, "post", fake_post)

    with pytest.raises(httpx.HTTPStatusError):
        await client.call("getblockchaininfo")

    await client.aclose()


def test_rpc_url_uses_wallet_path_when_provided() -> None:
    url = BitcoinRpcClient._rpc_url("student-wallet")
    assert url.endswith("/wallet/student-wallet")
