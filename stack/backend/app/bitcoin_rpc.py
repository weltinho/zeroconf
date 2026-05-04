from typing import Any
from urllib.parse import quote

import httpx

from app.settings import settings


class BitcoinRpcError(RuntimeError):
    # Exceção de domínio para diferenciar erro RPC de erro de rede/transporte.
    pass


class BitcoinRpcClient:
    def __init__(self) -> None:
        # AsyncClient reaproveita conexão (mais eficiente do que abrir por request).
        # auth usa usuário/senha do bitcoind (HTTP Basic Auth).
        self._client = httpx.AsyncClient(
            auth=(settings.bitcoin_rpc_user, settings.bitcoin_rpc_password),
            timeout=10.0,
        )
        # ID incremental útil para rastrear requisições JSON-RPC.
        self._id = 0

    async def call(
        self, method: str, params: list[Any] | None = None, wallet: str | None = None
    ) -> Any:
        # JSON-RPC exige um id por chamada para correlacionar resposta.
        self._id += 1
        # Payload no formato esperado pelo bitcoind.
        payload = {
            "jsonrpc": "1.0",
            "id": self._id,
            "method": method,
            "params": params or [],
        }
        # Chamada HTTP POST para endpoint RPC.
        response = await self._client.post(self._rpc_url(wallet), json=payload)
        body: Any | None = None
        try:
            body = response.json()
        except ValueError:
            # Alguns erros podem não retornar JSON (proxy, gateway, etc.).
            body = None

        # Prioriza erro JSON-RPC mesmo quando bitcoind responde HTTP 500.
        if isinstance(body, dict) and body.get("error"):
            raise BitcoinRpcError(self._format_jsonrpc_error(body["error"]))

        # Sem erro JSON-RPC explícito, mantém semântica de erro HTTP.
        response.raise_for_status()
        if not isinstance(body, dict):
            raise BitcoinRpcError("Invalid RPC response format")
        # Em sucesso, resultado real vem em "result".
        return body["result"]

    @staticmethod
    def _format_jsonrpc_error(error: Any) -> str:
        if isinstance(error, dict):
            code = error.get("code")
            message = error.get("message")
            if code is not None and message is not None:
                return f"RPC error {code}: {message}"
            if message is not None:
                return str(message)
        return str(error)

    @staticmethod
    def _rpc_url(wallet: str | None) -> str:
        if wallet is None:
            return settings.rpc_url
        wallet_name = wallet.strip()
        if not wallet_name:
            return settings.rpc_url
        return f"{settings.rpc_url}/wallet/{quote(wallet_name, safe='')}"

    async def aclose(self) -> None:
        # Fecha conexões abertas pelo pool HTTP.
        await self._client.aclose()
