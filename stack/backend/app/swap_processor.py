from __future__ import annotations

from decimal import Decimal, ROUND_CEILING
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bitcoin_rpc import BitcoinRpcClient, BitcoinRpcError
from app.db import get_session_factory
from app.models import SwapOrder
from app.routers.node import _ensure_fee_address_index0
from app.routers.node import _ensure_wallet_loaded
from app.settings import settings
from app.swap_logs import log_swap_step

MIN_SWAP_FEE_SATS = 1000
DEFAULT_SWAP_FEE_RATE_SAT_VB = 3


def _btc_to_sats(amount_btc: Any) -> int:
    try:
        d = Decimal(str(amount_btc))
    except Exception:
        return 0
    sats = int((d * Decimal(100_000_000)).to_integral_value(rounding="ROUND_FLOOR"))
    return sats


def _sats_to_btc_str(sats: int) -> str:
    d = (Decimal(sats) / Decimal(100_000_000)).quantize(Decimal("0.00000001"))
    # bitcoind aceita string decimal.
    return format(d, "f")


def _estimate_fee_sats(fee_rate_sat_vb: int, num_inputs: int, num_outputs: int) -> int:
    # Conservador para P2WPKH; 1-in/2-out ~= 141 vB.
    vbytes = 11 + 68 * max(1, num_inputs) + 31 * max(1, num_outputs)
    return int(fee_rate_sat_vb * vbytes)


def _btc_kvb_to_sat_vb_ceil(btc_per_kvb: Any) -> int:
    try:
        d = Decimal(str(btc_per_kvb))
    except Exception:
        return 0
    sat_per_vb = (d * Decimal(100_000_000)) / Decimal(1000)
    return int(sat_per_vb.to_integral_value(rounding=ROUND_CEILING))


class SwapOrderProcessor:
    def __init__(self, rpc: BitcoinRpcClient) -> None:
        self._rpc = rpc

    async def handle_hashtx(self, txid: str) -> None:
        wallet = settings.bitcoin_operator_wallet.strip()
        if not wallet:
            return

        try:
            await _ensure_wallet_loaded(wallet)
        except Exception:
            return

        # Usa gettransaction (wallet-aware) para descobrir endereços recebidos.
        try:
            tx = await self._rpc.call("gettransaction", [txid], wallet=wallet)
        except BitcoinRpcError:
            return
        except Exception:
            return

        if not isinstance(tx, dict):
            return

        details = tx.get("details")
        if not isinstance(details, list) or not details:
            return

        received_addresses: set[str] = set()
        for d in details:
            if not isinstance(d, dict):
                continue
            if str(d.get("category") or "") != "receive":
                continue
            addr = str(d.get("address") or "").strip()
            if addr:
                received_addresses.add(addr)

        if not received_addresses:
            return

        factory = get_session_factory()
        async with factory() as session:
            for addr in received_addresses:
                row = await session.execute(
                    select(SwapOrder).where(
                        SwapOrder.deposit_btc_address == addr,
                        SwapOrder.status.in_(["awaiting_deposit", "processing"]),
                    )
                )
                order = row.scalar_one_or_none()
                if order is None:
                    continue
                if order.payout_txid:
                    continue
                await log_swap_step(
                    session,
                    order.id,
                    "handle_hashtx.match_order",
                    "order matched from incoming wallet tx",
                    {"event_txid": txid, "deposit_btc_address": addr},
                )
                await self._try_payout_order(session, wallet, order)

            await session.commit()

    async def _try_payout_order(self, session: AsyncSession, wallet: str, order: SwapOrder) -> None:
        order.status = "processing"
        await log_swap_step(
            session,
            order.id,
            "_try_payout_order.start",
            "starting payout attempt",
            {"deposit_btc_address": order.deposit_btc_address},
        )

        try:
            unspent = await self._rpc.call(
                "listunspent",
                [0, 9999999, [order.deposit_btc_address], True],
                wallet=wallet,
            )
        except Exception as exc:
            order.status = "awaiting_deposit"
            order.last_error = f"listunspent failed: {exc}"
            await log_swap_step(
                session,
                order.id,
                "_try_payout_order.listunspent",
                "listunspent failed",
                {"error": str(exc)},
            )
            return

        if not isinstance(unspent, list):
            order.status = "awaiting_deposit"
            order.last_error = "listunspent invalid response"
            await log_swap_step(
                session,
                order.id,
                "_try_payout_order.listunspent",
                "listunspent invalid response",
            )
            return

        utxos: list[dict[str, Any]] = []
        total_sats = 0
        for u in unspent:
            if not isinstance(u, dict):
                continue
            if str(u.get("address") or "") != order.deposit_btc_address:
                continue
            if not u.get("spendable", True):
                continue
            sats = _btc_to_sats(u.get("amount"))
            if sats <= 0:
                continue
            txid = str(u.get("txid") or "")
            vout = u.get("vout")
            if not txid or not isinstance(vout, int):
                continue
            utxos.append({"txid": txid, "vout": vout})
            total_sats += sats

        if total_sats < int(order.required_deposit_sats):
            order.status = "awaiting_deposit"
            order.last_error = (
                f"underpaid: got {total_sats} sats, need {int(order.required_deposit_sats)} sats"
            )
            await log_swap_step(
                session,
                order.id,
                "_try_payout_order.required_check",
                "deposit below quoted requirement",
                {
                    "total_sats": total_sats,
                    "required_deposit_sats": int(order.required_deposit_sats),
                },
            )
            return

        fee_rate = int(order.fee_rate_sat_vb or DEFAULT_SWAP_FEE_RATE_SAT_VB)
        if fee_rate <= 0:
            fee_rate = DEFAULT_SWAP_FEE_RATE_SAT_VB
        # Evita tentar payout com fee abaixo do mínimo atual do mempool.
        try:
            mp = await self._rpc.call("getmempoolinfo")
            if isinstance(mp, dict) and mp.get("mempoolminfee") is not None:
                floor_rate = _btc_kvb_to_sat_vb_ceil(mp.get("mempoolminfee"))
                if floor_rate > fee_rate:
                    fee_rate = floor_rate
                    await log_swap_step(
                        session,
                        order.id,
                        "_try_payout_order.fee_floor",
                        "fee_rate raised to mempool minimum",
                        {"mempool_floor_sat_vb": floor_rate},
                    )
        except Exception:
            pass

        # Revalida com os inputs reais disponíveis (pode haver split/top-up em múltiplos UTXOs).
        dynamic_fee = max(
            _estimate_fee_sats(
                fee_rate,
                num_inputs=len(utxos),
                num_outputs=2,
            ),
            MIN_SWAP_FEE_SATS,
        )
        dynamic_required = int(order.output_sats) + dynamic_fee
        if total_sats < dynamic_required:
            missing = dynamic_required - total_sats
            order.status = "awaiting_deposit"
            order.last_error = (
                f"underpaid for current inputs: got {total_sats} sats, "
                f"need {dynamic_required} sats (missing {missing})"
            )
            await log_swap_step(
                session,
                order.id,
                "_try_payout_order.dynamic_fee_check",
                "insufficient funds after dynamic fee recompute",
                {
                    "total_sats": total_sats,
                    "dynamic_required_sats": dynamic_required,
                    "dynamic_fee_sats": dynamic_fee,
                    "missing_sats": missing,
                    "utxo_count": len(utxos),
                },
            )
            return

        # Política de tesouraria: troco sempre para o endereço fixo índice 0.
        try:
            change_address = await _ensure_fee_address_index0(wallet)
        except Exception as exc:
            order.status = "error"
            order.last_error = f"failed to resolve fee index0 change address: {exc}"
            await log_swap_step(
                session,
                order.id,
                "_try_payout_order.change_address",
                "failed to resolve fixed change address",
                {"error": str(exc)},
            )
            return

        outputs = {order.destination_btc_address: _sats_to_btc_str(int(order.output_sats))}
        options: dict[str, Any] = {
            "fee_rate": fee_rate,
            "replaceable": False,
            "lockUnspents": True,
            "changeAddress": change_address,
            # Regra do fluxo: gastar apenas os UTXOs pré-selecionados desta ordem.
            # Nunca deixar o Core puxar inputs de outros endereços/wallet.
            "add_inputs": False,
        }

        async def _unlock_selected() -> None:
            try:
                await self._rpc.call("lockunspent", [True, utxos], wallet=wallet)
            except Exception:
                # Best effort: lock residual não deve interromper fluxo principal.
                pass

        try:
            await log_swap_step(
                session,
                order.id,
                "_try_payout_order.walletcreatefundedpsbt",
                "creating funded psbt",
                {"utxos": utxos, "outputs": outputs, "options": options},
                auxiliary_info=(
                    "rpc=walletcreatefundedpsbt "
                    f"inputs={len(utxos)} output_btc={outputs.get(order.destination_btc_address)} "
                    f"fee_rate_sat_vb={options.get('fee_rate')} "
                    f"change_address={change_address}"
                ),
            )
            funded = await self._rpc.call(
                "walletcreatefundedpsbt",
                [utxos, outputs, 0, options],
                wallet=wallet,
            )
            if not isinstance(funded, dict) or not isinstance(funded.get("psbt"), str):
                await _unlock_selected()
                raise RuntimeError("walletcreatefundedpsbt invalid response")
            # Assina a PSBT com as chaves da carteira antes de finalizar.
            processed = await self._rpc.call(
                "walletprocesspsbt",
                [funded["psbt"]],
                wallet=wallet,
            )
            if not isinstance(processed, dict) or not isinstance(processed.get("psbt"), str):
                await _unlock_selected()
                raise RuntimeError("walletprocesspsbt invalid response")
            finalized = await self._rpc.call(
                "finalizepsbt",
                [processed["psbt"]],
                wallet=wallet,
            )
            if (
                not isinstance(finalized, dict)
                or not finalized.get("complete")
                or not isinstance(finalized.get("hex"), str)
            ):
                await _unlock_selected()
                raise RuntimeError(f"finalizepsbt incomplete response: {finalized}")
            payout_txid = await self._rpc.call(
                "sendrawtransaction",
                [finalized["hex"]],
                wallet=wallet,
            )
        except Exception as exc:
            await _unlock_selected()
            msg = str(exc)
            # Se a soma dos inputs pré-selecionados não cobre output+fee, tratamos como
            # "aguardando complemento" em vez de erro terminal.
            if "RPC error -4" in msg and "preselected coins total amount does not cover" in msg:
                order.status = "awaiting_deposit"
                order.last_error = (
                    "insufficient deposit for target output+fee; send a small top-up to deposit address"
                )
                await log_swap_step(
                    session,
                    order.id,
                    "_try_payout_order.error",
                    "rpc -4 insufficient preselected coins",
                    {"error": msg},
                )
                return
            order.status = "error"
            order.last_error = f"payout failed: {exc}"
            await log_swap_step(
                session,
                order.id,
                "_try_payout_order.error",
                "payout failed",
                {"error": msg},
            )
            return

        order.payout_txid = str(payout_txid)
        order.status = "confirming"
        order.last_error = None
        await log_swap_step(
            session,
            order.id,
            "_try_payout_order.broadcasted",
            "payout broadcasted; waiting confirmation",
            {"payout_txid": order.payout_txid},
        )

