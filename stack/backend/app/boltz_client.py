"""Cliente HTTP encapsulado para a API Boltz v2.

Responsabilidade única: fazer chamadas HTTP à API Boltz e retornar dados normalizados.
Sem lógica de negócio, sem acesso à BD.

Erros externos são convertidos em BoltzClientError com status HTTP e payload resumido.
"""

from __future__ import annotations

import json
import logging
import secrets
from typing import Any

import httpx

from app.settings import settings

logger = logging.getLogger(__name__)

_BOLTZ_TIMEOUT = httpx.Timeout(connect=5.0, read=20.0, write=10.0, pool=5.0)


class BoltzClientError(Exception):
    """Erro retornado pela API Boltz ou por falha de transporte."""

    def __init__(self, message: str, status_code: int | None = None, payload: Any = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload

    def __str__(self) -> str:
        base = super().__str__()
        if self.status_code:
            return f"[HTTP {self.status_code}] {base}"
        return base


def _base_url() -> str:
    url = settings.boltz_base_url.rstrip("/")
    return url


async def _request(method: str, path: str, **kwargs: Any) -> Any:
    """Executa chamada HTTP à API Boltz e retorna o JSON decodificado."""
    url = f"{_base_url()}{path}"
    async with httpx.AsyncClient(timeout=_BOLTZ_TIMEOUT) as client:
        try:
            resp = await client.request(method, url, **kwargs)
        except httpx.TransportError as exc:
            raise BoltzClientError(f"transport error: {exc}") from exc

    try:
        data = resp.json()
    except Exception:
        data = resp.text

    if not resp.is_success:
        # Extrai mensagem de erro do payload Boltz quando disponível.
        error_msg = data if isinstance(data, str) else data.get("error", str(data))
        raise BoltzClientError(
            str(error_msg)[:256],
            status_code=resp.status_code,
            payload=data,
        )

    return data


async def get_submarine_pairs() -> dict[str, Any]:
    """Retorna os pares disponíveis para submarine swap (BTC -> Lightning).

    Endpoint: GET /v2/swap/submarine
    Retorna dict com pares, fees e limites.
    """
    return await _request("GET", "/v2/swap/submarine")


async def create_submarine_swap(
    *,
    invoice: str,
    refund_pubkey_hex: str,
    pair: str = "BTC/BTC",
    pair_hash: str,
) -> dict[str, Any]:
    """Cria um submarine swap na Boltz.

    Parâmetros:
        invoice: Invoice BOLT11 fornecida pelo destinatário.
        refund_pubkey_hex: Chave pública secp256k1 compressed (33B, hex) para o script de refund.
        pair: Par de swap (default "BTC/BTC" — on-chain para Lightning).
        pair_hash: Hash do pair obtido em get_submarine_pairs() para validação de fees.

    Retorna dict com: id, bip21, address, expectedAmount, swapTree, etc.
    """
    body = {
        "invoice": invoice,
        "pair": pair,
        "pairHash": pair_hash,
        "from": "BTC",
        "to": "BTC",
        "refundPublicKey": refund_pubkey_hex,
    }
    return await _request("POST", "/v2/swap/submarine", json=body)


async def get_swap_status(swap_id: str) -> dict[str, Any]:
    """Consulta o status atual de um swap na Boltz.

    Endpoint: GET /v2/swap/{id}
    Retorna dict com: id, status, transaction, failureReason, etc.
    """
    return await _request("GET", f"/v2/swap/{swap_id}")


def generate_refund_keypair() -> tuple[str, str]:
    """Gera um par de chaves secp256k1 para o script de refund Boltz.

    Usa a biblioteca `cryptography` (hazmat EC primitives).
    Retorna: (privkey_hex 64 chars, pubkey_hex 66 chars compressed)
    """
    from cryptography.hazmat.primitives.asymmetric.ec import SECP256K1, generate_private_key
    from cryptography.hazmat.backends import default_backend

    privkey = generate_private_key(SECP256K1(), default_backend())
    privkey_int = privkey.private_numbers().private_value
    privkey_hex = privkey_int.to_bytes(32, "big").hex()

    pub_numbers = privkey.public_key().public_numbers()
    prefix = b"\x02" if pub_numbers.y % 2 == 0 else b"\x03"
    pubkey_bytes = prefix + pub_numbers.x.to_bytes(32, "big")
    pubkey_hex = pubkey_bytes.hex()

    return privkey_hex, pubkey_hex
