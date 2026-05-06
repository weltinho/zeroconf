"""Router para criação e consulta de ordens Boltz (submarine swap).

Fluxo: cliente envia invoice BOLT11 -> obtemos pair/fees -> criamos swap Boltz
-> geramos deposit address da nossa wallet -> persistimos swap_orders (provider=boltz)
+ swap_order_boltz -> retornamos nosso deposit address ao cliente.
O swap_processor detecta o depósito e encaminha exatamente expected_onchain_amount_sat
para o lockup address da Boltz. O boltz_poller monitora o swap e atualiza o status.

Estados locais Boltz (mapeamento de status_raw -> status em swap_orders):
  - awaiting_deposit      : swap criado, aguardando depósito on-chain
  - deposit_detected      : Boltz detectou transação no mempool/bloco
  - provider_processing   : Boltz está processando o pagamento Lightning
  - paid_out              : pagamento Lightning confirmado
  - error                 : estado terminal de falha (qualquer lado)
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.boltz_client import BoltzClientError, create_submarine_swap, generate_refund_keypair, get_submarine_pairs
from app.db import get_session
from app.models import SwapOrder, SwapOrderBoltz
from app.settings import settings
from app.swap_logs import log_swap_step
from app.bitcoin_rpc import BitcoinRpcClient, BitcoinRpcError
from app.routers.node import _ensure_wallet_loaded

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/client/boltz", tags=["client-boltz"])

# Taxa de serviço cobrada por nós em cima do que a Boltz cobra.
OUR_FEE_SAT = 1000

# Fee rate padrão para a tx de forward cliente -> Boltz (sat/vB).
_DEFAULT_FORWARD_FEE_RATE = 3

# Estimativa conservadora de vbytes para tx 1-in/1-out P2WPKH.
_ESTIMATED_FORWARD_VBYTES = 141


def _estimate_forward_fee_sats(fee_rate: int = _DEFAULT_FORWARD_FEE_RATE) -> int:
    """Estima a taxa de mineração da tx de forward para o lockup Boltz."""
    return fee_rate * _ESTIMATED_FORWARD_VBYTES

# Mapeamento de status_raw Boltz -> status local enxuto.
# Referência: https://docs.boltz.exchange/v/api/lifecycle#submarine-swaps
_BOLTZ_STATUS_MAP: dict[str, str] = {
    # Swap criado; aguardando depósito on-chain.
    "invoice.set": "awaiting_deposit",
    "swap.created": "awaiting_deposit",
    # Boltz detectou transação no mempool.
    "transaction.mempool": "deposit_detected",
    "transaction.confirmed": "deposit_detected",
    # Boltz está enviando o pagamento Lightning.
    "invoice.pending": "provider_processing",
    # Pagamento Lightning confirmado.
    "invoice.settled": "paid_out",
    "transaction.claim.pending": "provider_processing",
    "transaction.claimed": "paid_out",
    # Estados de falha.
    "invoice.expired": "error",
    "invoice.failedToPay": "error",
    "swap.expired": "error",
    "transaction.lockupFailed": "error",
    "transaction.refunded": "error",
    "invoice.rejected": "error",
}


def boltz_status_to_local(status_raw: str | None) -> str:
    """Converte um status_raw da Boltz no status local enxuto correspondente."""
    if not status_raw:
        return "awaiting_deposit"
    return _BOLTZ_STATUS_MAP.get(status_raw, "awaiting_deposit")


class BoltzFeesResponse(BaseModel):
    percentage: float
    miner_fee_sat: int
    our_fee_sat: int
    min_amount_sat: int
    max_amount_sat: int


@router.get("/fees", response_model=BoltzFeesResponse)
async def get_fees() -> Any:
    """Retorna fees atuais da Boltz + nossa taxa de serviço."""
    if not settings.boltz_enabled:
        raise HTTPException(status_code=503, detail="Boltz integration is disabled")
    try:
        pairs_data = await get_submarine_pairs()
    except BoltzClientError as exc:
        raise HTTPException(status_code=502, detail=f"Boltz unavailable: {exc}") from exc
    try:
        btc_btc = pairs_data["BTC"]["BTC"]
        fees = btc_btc.get("fees", {})
        limits = btc_btc.get("limits", {})
        return BoltzFeesResponse(
            percentage=float(fees.get("percentage", 0.1)),
            miner_fee_sat=int(fees.get("minerFees", 302)),
            our_fee_sat=OUR_FEE_SAT,
            min_amount_sat=int(limits.get("minimal", 25000)),
            max_amount_sat=int(limits.get("maximal", 25000000)),
        )
    except (KeyError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Unexpected Boltz pairs structure") from exc


class CreateBoltzOrderRequest(BaseModel):
    invoice: str = Field(..., min_length=10, description="Invoice BOLT11 a ser paga via Lightning.")


class CreateBoltzOrderResponse(BaseModel):
    order_id: int
    status: str
    deposit_btc_address: str
    expected_onchain_amount_sat: int
    boltz_swap_id: str


@router.post("/orders", response_model=CreateBoltzOrderResponse)
async def create_boltz_order(
    req: CreateBoltzOrderRequest,
    session: AsyncSession = Depends(get_session),
) -> Any:
    if not settings.boltz_enabled:
        raise HTTPException(status_code=503, detail="Boltz integration is disabled")

    invoice = req.invoice.strip()
    if not invoice:
        raise HTTPException(status_code=400, detail="invoice is required")

    # 1. Obter pares Boltz (para extrair pair_hash e validar limites).
    try:
        pairs_data = await get_submarine_pairs()
    except BoltzClientError as exc:
        logger.error("Boltz get_submarine_pairs failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Boltz unavailable: {exc}") from exc

    # Extraímos pair_hash do par BTC/BTC (on-chain -> Lightning).
    try:
        pair_hash = pairs_data["BTC"]["BTC"]["hash"]
    except (KeyError, TypeError) as exc:
        logger.error("Unexpected Boltz pairs structure: %s", pairs_data)
        raise HTTPException(
            status_code=502, detail="Unexpected Boltz pairs response structure"
        ) from exc

    # 2. Gerar keypair secp256k1 para o script de refund.
    try:
        refund_privkey_hex, refund_pubkey_hex = generate_refund_keypair()
    except Exception as exc:
        logger.error("Failed to generate refund keypair: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate refund keypair") from exc

    # 3. Criar swap na Boltz.
    try:
        swap_data = await create_submarine_swap(
            invoice=invoice,
            refund_pubkey_hex=refund_pubkey_hex,
            pair="BTC/BTC",
            pair_hash=pair_hash,
        )
    except BoltzClientError as exc:
        logger.error("Boltz create_submarine_swap failed: %s | payload=%s", exc, exc.payload)
        raise HTTPException(
            status_code=422, detail=f"Boltz rejected swap: {exc}"
        ) from exc

    boltz_swap_id: str = swap_data.get("id", "")
    lockup_address: str = swap_data.get("address", "")
    expected_onchain_sat: int = int(swap_data.get("expectedAmount", 0))

    if not boltz_swap_id or not lockup_address:
        logger.error("Boltz swap response missing id/address: %s", swap_data)
        raise HTTPException(status_code=502, detail="Incomplete Boltz swap response")

    # 4. Gerar endereço de depósito na nossa wallet (o cliente envia para cá).
    wallet = settings.bitcoin_operator_wallet.strip()
    if not wallet:
        raise HTTPException(status_code=503, detail="Operator wallet not configured")
    try:
        await _ensure_wallet_loaded(wallet)
        rpc = BitcoinRpcClient(settings.bitcoin_rpc_url, settings.bitcoin_rpc_user, settings.bitcoin_rpc_password)
        our_deposit_address = str(
            await rpc.call("getnewaddress", [f"boltz-swap-{boltz_swap_id}", "bech32m"], wallet=wallet)
        )
    except Exception as exc:
        logger.error("Failed to generate deposit address: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate deposit address") from exc

    # required_deposit_sats = o que a Boltz espera + nossa taxa + fee estimada da tx de forward.
    forward_fee_sat = _estimate_forward_fee_sats()
    required_deposit_sats = expected_onchain_sat + OUR_FEE_SAT + forward_fee_sat

    # 5. Persistir swap_orders:
    #    - deposit_btc_address = nosso endereço (onde cliente envia)
    #    - destination_btc_address = lockup address da Boltz (para onde nós encaminhamos)
    #    - output_sats = expected_onchain_sat (exatamente o que a Boltz espera)
    #    - required_deposit_sats = o total que cobramos do cliente
    order = SwapOrder(
        output_sats=expected_onchain_sat,
        destination_btc_address=lockup_address,
        deposit_btc_address=our_deposit_address,
        required_deposit_sats=required_deposit_sats,
        fee_rate_sat_vb=_DEFAULT_FORWARD_FEE_RATE,
        provider="boltz",
        provider_id=boltz_swap_id,
        status="awaiting_deposit",
    )
    session.add(order)
    await session.flush()  # atribui order.id

    await log_swap_step(
        session,
        order.id,
        "boltz.create_order",
        "Boltz submarine swap created",
        {
            "boltz_swap_id": boltz_swap_id,
            "lockup_address": lockup_address,
            "our_deposit_address": our_deposit_address,
            "expected_onchain_amount_sat": expected_onchain_sat,
            "required_deposit_sats": required_deposit_sats,
            "forward_fee_sat": forward_fee_sat,
            "pair_hash": pair_hash,
        },
    )

    # 5. Persistir swap_order_boltz com metadados Boltz.
    boltz_detail = SwapOrderBoltz(
        swap_order_id=order.id,
        boltz_swap_id=boltz_swap_id,
        pair_id="BTC/BTC",
        pair_hash=pair_hash,
        invoice_bolt11=invoice,
        lockup_address=lockup_address,
        expected_onchain_amount_sat=expected_onchain_sat,
        status_raw=swap_data.get("status"),
        last_payload_json=json.dumps(swap_data, ensure_ascii=True, separators=(",", ":")),
        refund_pubkey_hex=refund_pubkey_hex,
        refund_privkey_hex=refund_privkey_hex,
    )
    session.add(boltz_detail)

    await session.commit()

    return CreateBoltzOrderResponse(
        order_id=order.id,
        status=order.status,
        deposit_btc_address=our_deposit_address,
        expected_onchain_amount_sat=required_deposit_sats,
        boltz_swap_id=boltz_swap_id,
    )


class GetBoltzOrderResponse(BaseModel):
    order_id: int
    status: str
    boltz_swap_id: str
    deposit_btc_address: str | None
    expected_onchain_amount_sat: int | None
    status_raw: str | None
    lockup_tx_id: str | None = None


@router.get("/orders/{order_id}", response_model=GetBoltzOrderResponse)
async def get_boltz_order(
    order_id: int,
    session: AsyncSession = Depends(get_session),
) -> Any:
    from sqlalchemy import select

    result = await session.execute(
        select(SwapOrder).where(
            SwapOrder.id == order_id,
            SwapOrder.provider == "boltz",
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Boltz order not found")

    result_boltz = await session.execute(
        select(SwapOrderBoltz).where(SwapOrderBoltz.swap_order_id == order.id)
    )
    boltz = result_boltz.scalar_one_or_none()

    # Extrai o ID da transação on-chain do payload mais recente da Boltz.
    lockup_tx_id: str | None = None
    if boltz and boltz.last_payload_json:
        try:
            payload = json.loads(boltz.last_payload_json)
            lockup_tx_id = payload.get("transaction", {}).get("id") or None
        except Exception:
            pass

    return GetBoltzOrderResponse(
        order_id=order.id,
        status=order.status,
        boltz_swap_id=boltz.boltz_swap_id if boltz else "",
        deposit_btc_address=boltz.lockup_address if boltz else None,
        expected_onchain_amount_sat=boltz.expected_onchain_amount_sat if boltz else None,
        status_raw=boltz.status_raw if boltz else None,
        lockup_tx_id=lockup_tx_id,
    )
