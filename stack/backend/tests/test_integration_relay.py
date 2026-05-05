import asyncio
import json
import os

import httpx
import pytest
import websockets


BACKEND_WS_URL = os.getenv("TEST_BACKEND_WS_URL", "ws://127.0.0.1:8000/ws/events")
BITCOIND_HOST = os.getenv("BITCOIN_HOST", "bitcoind")
BITCOIND_PORT = os.getenv("BITCOIN_RPC_PORT", "8332")
BITCOIND_RPC_URL = f"http://{BITCOIND_HOST}:{BITCOIND_PORT}"
BITCOIND_RPC_USER = os.getenv("BITCOIN_RPC_USER", "bitcoinrpc")
BITCOIND_RPC_PASSWORD = os.getenv("BITCOIN_RPC_PASSWORD", "bitcoinrpcdevpassword")
TEST_WALLET_NAME = os.getenv("TEST_WALLET_NAME", "integration-relay-wallet")


def _rpc_payload(method: str, params: list[object] | None = None) -> dict[str, object]:
    return {"jsonrpc": "1.0", "id": 1, "method": method, "params": params or []}


async def _bitcoind_rpc(
    client: httpx.AsyncClient,
    method: str,
    params: list[object] | None = None,
    wallet: str | None = None,
) -> object:
    # Chama o bitcoind diretamente para obter o "ground truth" do teste.
    url = BITCOIND_RPC_URL if wallet is None else f"{BITCOIND_RPC_URL}/wallet/{wallet}"
    response = await client.post(
        url,
        json=_rpc_payload(method, params),
        auth=(BITCOIND_RPC_USER, BITCOIND_RPC_PASSWORD),
    )
    response.raise_for_status()
    body = response.json()
    if body.get("error"):
        raise RuntimeError(f"bitcoind RPC error: {body['error']}")
    return body["result"]


@pytest.mark.asyncio
async def test_zmq_websocket_relay_matches_bitcoind_hash_notifications() -> None:
    async with httpx.AsyncClient(timeout=15.0) as rpc_client:
        chain_info = await _bitcoind_rpc(rpc_client, "getblockchaininfo")
        if chain_info.get("chain") == "main":
            pytest.skip(
                "generatetoaddress não está disponível na mainnet; use signet ou regtest."
            )

        # Prepara wallet para minerar bloco via RPC.
        loaded_wallets = await _bitcoind_rpc(rpc_client, "listwallets")
        if TEST_WALLET_NAME not in loaded_wallets:
            try:
                await _bitcoind_rpc(rpc_client, "createwallet", [TEST_WALLET_NAME])
            except RuntimeError:
                # Se já existir no disco, apenas carregar.
                pass
            if TEST_WALLET_NAME not in await _bitcoind_rpc(rpc_client, "listwallets"):
                await _bitcoind_rpc(rpc_client, "loadwallet", [TEST_WALLET_NAME])

        mining_address = await _bitcoind_rpc(
            rpc_client, "getnewaddress", wallet=TEST_WALLET_NAME
        )

        # Conecta no relay WS e dispara um bloco novo no bitcoind.
        async with websockets.connect(BACKEND_WS_URL) as ws:
            generated_hashes = await _bitcoind_rpc(
                rpc_client,
                "generatetoaddress",
                [1, mining_address],
                wallet=TEST_WALLET_NAME,
            )
            if not generated_hashes:
                pytest.skip(
                    "generatetoaddress returned no block hashes: on public signet you "
                    "cannot mine from a random wallet (needs signet miner keys); use "
                    "regtest or a custom signet to exercise this path."
                )
            expected_block_hash = generated_hashes[0]
            print(f"\n[ZMQ] mined block hash: {expected_block_hash}")

            block_verbose = await _bitcoind_rpc(
                rpc_client, "getblock", [expected_block_hash, 2]
            )
            # Primeira transação do bloco minerado é a coinbase.
            expected_coinbase_txid = block_verbose["tx"][0]["txid"]
            print(f"[ZMQ] expected coinbase txid: {expected_coinbase_txid}")

            got_hashblock = False
            got_hashtx = False

            # Relay envia resumo (_shape_for_operator): hash_do_bloco / txid, não payload_hex bruto.
            for _ in range(10):
                raw_message = await asyncio.wait_for(ws.recv(), timeout=8)
                event = json.loads(raw_message)
                print("[ZMQ] relay event:")
                print(json.dumps(event, indent=2, sort_keys=True))

                if event.get("topic") == "hashblock" and (
                    event.get("hash_do_bloco") == expected_block_hash
                    or event.get("payload_hex") == expected_block_hash
                ):
                    got_hashblock = True

                if event.get("topic") == "hashtx" and (
                    event.get("txid") == expected_coinbase_txid
                    or event.get("payload_hex") == expected_coinbase_txid
                ):
                    got_hashtx = True

                if got_hashblock and got_hashtx:
                    break

            assert got_hashblock, "did not receive expected hashblock event from relay"
            assert got_hashtx, "did not receive expected hashtx event from relay"
