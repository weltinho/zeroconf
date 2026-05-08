from __future__ import annotations

from decimal import Decimal, ROUND_CEILING
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bitcoin_rpc import BitcoinRpcClient, BitcoinRpcError
from app.bitrefill_client import BitrefillClientError, bitrefill_create_invoice
from app.db import get_session_factory
from app.models import SwapOrder, SwapOrderBitrefill
from app.routers.node import _ensure_fee_address_index0
from app.routers.node import _ensure_wallet_loaded
from app.settings import settings
from app.signet_demo import (
    chain_is_signet,
    is_signet_demo_boltz_swap_id,
    run_signet_boltz_demo_progression,
    run_signet_bitrefill_demo_progression,
    sats_sent_to_address_in_decoded_tx,
    schedule_signet_demo_task,
)
from app.swap_logs import log_swap_step

MIN_SWAP_FEE_SATS = 1000
DEFAULT_SWAP_FEE_RATE_SAT_VB = 3
# Endereço reservado para QA: força falha no envio direto (fluxo internal/on-chain).
FORCED_DIRECT_PAYOUT_FAIL_ADDRESS = "tb1q06vfhkjd8d3dhh0f63mxgz4sksvx8za9rj7lvr"


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


async def _ensure_bitrefill_invoice(
    session: AsyncSession,
    order: SwapOrder,
) -> bool:
    """Cria invoice crypto na Bitrefill na primeira vez; actualiza destination + output_sats."""

    row = await session.execute(
        select(SwapOrderBitrefill).where(SwapOrderBitrefill.swap_order_id == order.id)
    )
    br = row.scalar_one_or_none()
    if br is None:
        order.last_error = "dados Bitrefill em falta (swap_order_bitrefill)"
        await log_swap_step(
            session,
            order.id,
            "_try_payout.bitrefill_meta",
            "swap_order_bitrefill em falta",
            {},
        )
        return False
    if br.bitrefill_invoice_id:
        return True

    prod: dict[str, Any] = {
        "product_id": br.product_id,
        "quantity": 1,
    }
    if br.package_id:
        prod["package_id"] = br.package_id.strip()
    if br.recipient_phone:
        prod["phone_number"] = br.recipient_phone.strip()

    body = {
        "products": [prod],
        "payment_method": "bitcoin",
        "refund_address": br.refund_btc_address,
        "email": br.customer_email,
        "send_email": True,
    }
    try:
        inv = await bitrefill_create_invoice(body)
    except BitrefillClientError as exc:
        order.last_error = f"invoice Bitrefill: {exc}"
        await log_swap_step(session, order.id, "bitrefill.invoice_error", str(exc), {})
        return False

    data = inv.get("data") if isinstance(inv, dict) else None
    if not isinstance(data, dict):
        order.last_error = "resposta invoice inválida (sem data)"
        return False
    pay = data.get("payment")
    if not isinstance(pay, dict):
        order.last_error = "invoice sem objeto payment"
        return False

    addr = str(pay.get("address") or "").strip()
    payout_sats = _btc_to_sats(pay.get("price"))
    inv_id = str(data.get("id") or "").strip()
    if not addr or payout_sats <= 0:
        order.last_error = "invoice sem payment.address / price válidos"
        await log_swap_step(
            session,
            order.id,
            "bitrefill.invoice_bad_payment",
            "payment incompleto",
            {"invoice_id": inv_id},
        )
        return False

    br.bitrefill_invoice_id = inv_id or None
    order.destination_btc_address = addr
    order.output_sats = payout_sats
    if inv_id:
        order.provider_id = inv_id[: min(127, len(inv_id))]
    await log_swap_step(
        session,
        order.id,
        "bitrefill.invoice_created",
        "invoice Bitrefill criada — destino efectivo definido",
        {
            "invoice_id": inv_id,
            "payment_address": addr,
            "payment_sats": payout_sats,
        },
    )
    return True


class SwapOrderProcessor:
    def __init__(self, rpc: BitcoinRpcClient) -> None:
        self._rpc = rpc

    async def _decode_wallet_tx(self, wallet: str, txid: str) -> dict[str, Any] | None:
        try:
            tx = await self._rpc.call("gettransaction", [txid], wallet=wallet)
        except BitcoinRpcError:
            return None
        except Exception:
            return None
        if not isinstance(tx, dict):
            return None
        hex_raw = tx.get("hex")
        if not isinstance(hex_raw, str) or not hex_raw:
            try:
                r = await self._rpc.call("getrawtransaction", [txid, False], wallet=wallet)
                hex_raw = r if isinstance(r, str) else ""
            except BitcoinRpcError:
                hex_raw = ""
            except Exception:
                hex_raw = ""
        if not hex_raw:
            return None
        try:
            dec = await self._rpc.call("decoderawtransaction", [hex_raw])
        except BitcoinRpcError:
            return None
        except Exception:
            return None
        return dec if isinstance(dec, dict) else None

    async def _maybe_handle_signet_demo(
        self,
        session: AsyncSession,
        wallet: str,
        order: SwapOrder,
        event_txid: str | None,
    ) -> bool:
        """Signet: depósito real no endereço da ordem (como mainnet); depois mocks na BD."""

        if not await chain_is_signet():
            return False
        if order.provider == "boltz" and is_signet_demo_boltz_swap_id(order.provider_id):
            return await self._signet_demo_boltz_deposit(session, wallet, order, event_txid)
        if order.provider == "bitrefill":
            return await self._signet_demo_bitrefill_deposit(session, wallet, order, event_txid)
        return False

    async def _signet_demo_collect_sats(
        self,
        wallet: str,
        order: SwapOrder,
    ) -> tuple[list[dict[str, Any]], int]:
        try:
            unspent = await self._rpc.call(
                "listunspent",
                [0, 9999999, [order.deposit_btc_address], True],
                wallet=wallet,
            )
        except Exception:
            return [], 0
        if not isinstance(unspent, list):
            return [], 0
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
        return utxos, total_sats

    async def _signet_demo_boltz_deposit(
        self,
        session: AsyncSession,
        wallet: str,
        order: SwapOrder,
        event_txid: str | None,
    ) -> bool:
        import json

        from sqlalchemy import select as sa_select

        from app.models import SwapOrderBoltz as SOB

        dep = (order.deposit_btc_address or "").strip()
        paid_from_event = 0
        if event_txid and dep:
            decoded = await self._decode_wallet_tx(wallet, event_txid)
            if isinstance(decoded, dict):
                paid_from_event = sats_sent_to_address_in_decoded_tx(decoded, dep)

        _utxos, total_from_utxo = await self._signet_demo_collect_sats(wallet, order)
        total_sats = max(total_from_utxo, paid_from_event)

        if total_sats < int(order.required_deposit_sats):
            order.actual_deposit_sats = total_sats
            order.last_error = (
                f"signet.demo underpaid: {total_sats} sats / need {int(order.required_deposit_sats)}"
            )
            await log_swap_step(
                session,
                order.id,
                "signet.demo.deposit",
                "depósito insuficiente para demo",
                {"total_sats": total_sats, "required": int(order.required_deposit_sats)},
            )
            return True

        order.status = "deposit_detected"
        order.actual_deposit_sats = total_sats
        order.last_error = None
        res_b = await session.execute(sa_select(SOB).where(SOB.swap_order_id == order.id))
        boltz = res_b.scalar_one_or_none()
        if boltz:
            if event_txid:
                boltz.deposit_tx_id = event_txid
            boltz.status_raw = "transaction.mempool"
            boltz.last_payload_json = json.dumps(
                {
                    "status": "transaction.mempool",
                    "signetDemo": True,
                    "deposit_txid": event_txid,
                },
                ensure_ascii=True,
                separators=(",", ":"),
            )
        await log_swap_step(
            session,
            order.id,
            "signet.demo.deposit",
            "depósito detetado — agendando progressão mock",
            {"total_sats": total_sats, "event_txid": event_txid},
        )
        schedule_signet_demo_task(
            run_signet_boltz_demo_progression(order.id, event_txid or ""),
        )
        return True

    async def _signet_demo_bitrefill_deposit(
        self,
        session: AsyncSession,
        wallet: str,
        order: SwapOrder,
        event_txid: str | None,
    ) -> bool:
        dep = (order.deposit_btc_address or "").strip()
        paid_from_event = 0
        if event_txid and dep:
            decoded = await self._decode_wallet_tx(wallet, event_txid)
            if isinstance(decoded, dict):
                paid_from_event = sats_sent_to_address_in_decoded_tx(decoded, dep)

        _utxos, total_from_utxo = await self._signet_demo_collect_sats(wallet, order)
        total_sats = max(total_from_utxo, paid_from_event)

        if total_sats < int(order.required_deposit_sats):
            order.actual_deposit_sats = total_sats
            order.last_error = (
                f"signet.demo underpaid: {total_sats} sats / need {int(order.required_deposit_sats)}"
            )
            await log_swap_step(
                session,
                order.id,
                "signet.demo.deposit",
                "depósito insuficiente (Bitrefill signet)",
                {"total_sats": total_sats},
            )
            return True

        order.status = "deposit_detected"
        order.actual_deposit_sats = total_sats
        order.last_error = None
        await log_swap_step(
            session,
            order.id,
            "signet.demo.deposit",
            "depósito detetado (Bitrefill signet) — progressão mock",
            {"total_sats": total_sats, "event_txid": event_txid},
        )
        schedule_signet_demo_task(
            run_signet_bitrefill_demo_progression(order.id, event_txid or ""),
        )
        return True

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
                    select(SwapOrder)
                    .where(
                        SwapOrder.deposit_btc_address == addr,
                        SwapOrder.status.in_(
                            [
                                "awaiting_deposit",
                                "processing",
                                "deposit_detected",
                                "provider_processing",
                            ]
                        ),
                    )
                    .order_by(SwapOrder.id.asc())
                )
                for order in row.scalars().all():
                    if order.payout_txid:
                        continue
                    await log_swap_step(
                        session,
                        order.id,
                        "handle_hashtx.match_order",
                        "order matched from incoming wallet tx",
                        {"event_txid": txid, "deposit_btc_address": addr},
                    )
                    await self._try_payout_order(session, wallet, order, event_txid=txid)

            await session.commit()

    async def _try_payout_order(self, session: AsyncSession, wallet: str, order: SwapOrder, event_txid: str | None = None) -> None:
        if await self._maybe_handle_signet_demo(session, wallet, order, event_txid):
            return

        try:
            unspent = await self._rpc.call(
                "listunspent",
                [0, 9999999, [order.deposit_btc_address], True],
                wallet=wallet,
            )
        except Exception as exc:
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

        if total_sats <= 0:
            order.status = "awaiting_deposit"
            order.actual_deposit_sats = 0
            order.last_error = None
            return

        order.actual_deposit_sats = total_sats
        if order.status in {"awaiting_deposit", "processing"}:
            order.status = "deposit_detected"
            await log_swap_step(
                session,
                order.id,
                "_try_payout_order.deposit_detected",
                "deposit detected on order address",
                {"total_sats": total_sats, "event_txid": event_txid},
            )

        if total_sats < int(order.required_deposit_sats):
            order.status = "deposit_detected"
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
            order.status = "deposit_detected"
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

        order.status = "provider_processing"
        order.last_error = None
        await log_swap_step(
            session,
            order.id,
            "_try_payout_order.start",
            "starting provider/payout processing after deposit detection",
            {"deposit_btc_address": order.deposit_btc_address, "total_sats": total_sats},
        )

        if (
            order.provider == "internal"
            and (order.destination_btc_address or "").strip() == FORCED_DIRECT_PAYOUT_FAIL_ADDRESS
        ):
            order.status = "error"
            order.last_error = "payout failed: forced QA failure for reserved destination address"
            await log_swap_step(
                session,
                order.id,
                "_try_payout_order.qa_forced_failure",
                "forced failure activated for reserved destination address",
                {"destination_btc_address": order.destination_btc_address},
            )
            return

        if order.provider == "bitrefill":
            if not await _ensure_bitrefill_invoice(session, order):
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
                order.status = "deposit_detected"
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
        # Para ordens Boltz, salvar o txid do depósito do cliente e marcar status intermediário.
        if order.provider == "boltz":
            order.status = "provider_processing"
            # Salva o deposit_tx_id (cliente → nós) no registo Boltz.
            if event_txid:
                from sqlalchemy import select as _select
                from app.models import SwapOrderBoltz as _SOB
                res = await session.execute(_select(_SOB).where(_SOB.swap_order_id == order.id))
                boltz_detail = res.scalar_one_or_none()
                if boltz_detail:
                    boltz_detail.deposit_tx_id = event_txid
        else:
            order.status = "confirming"
        order.last_error = None
        await log_swap_step(
            session,
            order.id,
            "_try_payout_order.broadcasted",
            "payout broadcasted; waiting confirmation",
            {"payout_txid": order.payout_txid},
        )

