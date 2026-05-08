"""Painel do operador: estado da cadeia e carteira — sem passthrough RPC genérico."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.bitcoin_rpc import BitcoinRpcError
from app.deps import rpc
from app.routers.auth_adm import get_adm_user
from app.settings import settings

router = APIRouter(prefix="/adm/node", tags=["adm-node"])


@router.get("/chain")
async def node_chain(_user: dict = Depends(get_adm_user)) -> dict[str, Any]:
    try:
        info = await rpc.call("getblockchaininfo")
    except BitcoinRpcError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"bitcoind indisponível: {exc}") from exc

    if not isinstance(info, dict):
        raise HTTPException(status_code=502, detail="Resposta RPC inválida")

    # Campos estáveis para o painel (sem expor o JSON completo do Core).
    return {
        "chain": info.get("chain"),
        "blocks": info.get("blocks"),
        "headers": info.get("headers"),
        "bestblockhash": info.get("bestblockhash"),
        "verificationprogress": info.get("verificationprogress"),
        "initialblockdownload": info.get("initialblockdownload"),
        "chainwork": info.get("chainwork"),
        "mediantime": info.get("mediantime"),
        "difficulty": info.get("difficulty"),
        "size_on_disk": info.get("size_on_disk"),
        "pruned": info.get("pruned"),
        "pruneheight": info.get("pruneheight"),
        "warnings": info.get("warnings"),
    }


def _wallet_name() -> str | None:
    name = settings.bitcoin_operator_wallet.strip()
    return name if name else None


async def _ensure_fee_address_index0(wallet: str) -> str:
    """Garante um endereço fixo (label) para taxa/depósito operacional."""
    label = settings.bitcoin_fee_address_label.strip() or "fee-index-0"
    try:
        by_label = await rpc.call("getaddressesbylabel", [label], wallet=wallet)
        if isinstance(by_label, Mapping) and by_label:
            return sorted(str(addr) for addr in by_label.keys())[0]
    except BitcoinRpcError as exc:
        msg = str(exc)
        # Sem endereço para o label ainda -> cria.
        if "RPC error -11" not in msg and "No addresses with label" not in msg:
            raise

    created = await rpc.call("getnewaddress", [label, "bech32"], wallet=wallet)
    return str(created)


async def _ensure_wallet_loaded(wallet: str) -> None:
    """Garante carteira carregada; cria automaticamente na primeira execução."""
    try:
        loaded = await rpc.call("listwallets")
    except BitcoinRpcError:
        return
    if isinstance(loaded, list) and wallet in loaded:
        return
    try:
        await rpc.call("loadwallet", [wallet])
        return
    except BitcoinRpcError as exc:
        err = str(exc)
        # -18: carteira não existe/no disco; cria para bootstrap da primeira execução.
        if "RPC error -18" not in err:
            # Já existe mas pode estar em erro transitório (ex.: corrida no startup).
            # Repassa para quem chamou decidir a mensagem final ao operador.
            raise

    # Primeira execução: cria carteira descriptor nativa com nome fixo do operador.
    # Se outra instância criou em paralelo, o getwalletinfo logo a seguir cobre isso.
    try:
        await rpc.call("createwallet", [wallet])
    except BitcoinRpcError as exc:
        err = str(exc)
        # -4 geralmente indica "already exists"; tenta carregar mais uma vez.
        if "RPC error -4" not in err:
            raise
        await rpc.call("loadwallet", [wallet])


@router.get("/wallet")
async def node_wallet(_user: dict = Depends(get_adm_user)) -> dict[str, Any]:
    w = _wallet_name()
    out: dict[str, Any] = {
        "wallet_name": w,
        "configured": w is not None,
        "loaded": False,
        "error": None,
        "fee_address_index0": None,
        "addresses": [],
        "unspent_by_address": [],
    }
    if w is None:
        out["error"] = (
            "Define BITCOIN_OPERATOR_WALLET no ambiente (nome da carteira no bitcoind)."
        )
        return out

    try:
        await _ensure_wallet_loaded(w)
        await rpc.call("getwalletinfo", wallet=w)
        out["loaded"] = True
    except BitcoinRpcError as exc:
        # bitcoind respondeu: erro lógico RPC (carteira inexistente, etc.)
        out["error"] = str(exc)
        return out
    except Exception as exc:
        # Rede / daemon parado — igual ao GET /chain (evita 500 genérico).
        raise HTTPException(
            status_code=502, detail=f"bitcoind indisponível: {exc}"
        ) from exc

    try:
        fee_addr = await _ensure_fee_address_index0(w)
        received = await rpc.call(
            "listreceivedbyaddress",
            [0, True, False],
            wallet=w,
        )
        unspent = await rpc.call(
            "listunspent",
            [0, 9999999, [], True],
            wallet=w,
        )
    except BitcoinRpcError as exc:
        out["error"] = str(exc)
        return out
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"bitcoind indisponível: {exc}"
        ) from exc

    addresses: list[dict[str, Any]] = []
    received_by_address: dict[str, float] = {}
    if isinstance(received, list):
        for row in received:
            if not isinstance(row, Mapping):
                continue
            addr = str(row.get("address") or "")
            try:
                received_amt = float(row.get("amount") or 0)
            except Exception:
                received_amt = 0.0
            if addr:
                received_by_address[addr] = received_amt
            addresses.append(
                {
                    "address": addr,
                    "amount": row.get("amount"),
                    "confirmations": row.get("confirmations"),
                    "label": row.get("label"),
                    "txids": row.get("txids") if isinstance(row.get("txids"), list) else [],
                }
            )

    by_addr: dict[str, list[dict[str, Any]]] = defaultdict(list)
    if isinstance(unspent, list):
        for u in unspent:
            if not isinstance(u, Mapping):
                continue
            addr = str(u.get("address") or "")
            by_addr[addr].append(
                {
                    "txid": u.get("txid"),
                    "vout": u.get("vout"),
                    "amount": u.get("amount"),
                    "confirmations": u.get("confirmations"),
                    "spendable": u.get("spendable"),
                    "safe": u.get("safe"),
                }
            )

    unspent_by_address = []
    for addr, utxos in sorted(by_addr.items(), key=lambda x: x[0]):
        total = sum(float(u.get("amount") or 0) for u in utxos)
        unspent_by_address.append(
            {
                "address": addr,
                "utxo_count": len(utxos),
                "total_btc": round(total, 8),
                "utxos": utxos,
            }
        )

    fee_utxos = by_addr.get(fee_addr, [])
    fee_balance = round(sum(float(u.get("amount") or 0) for u in fee_utxos), 8)
    out["fee_address_index0"] = {
        "label": settings.bitcoin_fee_address_label.strip() or "fee-index-0",
        "address": fee_addr,
        "received_total_btc": round(received_by_address.get(fee_addr, 0.0), 8),
        "utxo_count": len(fee_utxos),
        "spendable_balance_btc": fee_balance,
    }
    out["addresses"] = addresses
    out["unspent_by_address"] = unspent_by_address
    return out


class AdminWithdrawPreviewRequest(BaseModel):
    master_password: str
    destination_btc_address: str


def _sats_to_btc_str(sats: int) -> str:
    d = (Decimal(sats) / Decimal(100_000_000)).quantize(Decimal("0.00000001"))
    return format(d, "f")


async def _build_admin_withdraw_psbt(
    *,
    wallet: str,
    destination: str,
    lock_unspents: bool,
) -> dict[str, Any]:
    # Evita "vazamento" de lock de tentativas anteriores (preview/execute interrompidos).
    try:
        locked = await rpc.call("listlockunspent", [], wallet=wallet)
        if isinstance(locked, list) and locked:
            await rpc.call("lockunspent", [True, locked], wallet=wallet)
    except Exception:
        # Best effort: se falhar, seguimos com listunspent e diagnóstico abaixo.
        pass

    fee_index0 = await _ensure_fee_address_index0(wallet)
    unspent = await rpc.call("listunspent", [0, 9999999, [], True], wallet=wallet)
    if not isinstance(unspent, list):
        raise HTTPException(status_code=502, detail="listunspent invalid response")

    utxos: list[dict[str, Any]] = []
    total_seen = 0
    total_on_fee_index0 = 0
    total_spendable_on_fee_index0 = 0
    total_sats = 0
    for u in unspent:
        if not isinstance(u, Mapping):
            continue
        total_seen += 1
        addr = str(u.get("address") or "").strip()
        if addr != fee_index0:
            continue
        total_on_fee_index0 += 1
        if not u.get("spendable", True):
            continue
        total_spendable_on_fee_index0 += 1
        txid = str(u.get("txid") or "").strip()
        vout = u.get("vout")
        amount = u.get("amount")
        if not txid or not isinstance(vout, int):
            continue
        try:
            sats = int((Decimal(str(amount or 0)) * Decimal(100_000_000)).to_integral_value())
        except Exception:
            sats = 0
        if sats <= 0:
            continue
        utxos.append({"txid": txid, "vout": vout})
        total_sats += sats

    if not utxos or total_sats <= 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "no spendable UTXOs available on fee-index-0 address"
                f" (seen_all={total_seen}, on_fee_index0={total_on_fee_index0},"
                f" spendable_on_fee_index0={total_spendable_on_fee_index0}, selected={len(utxos)})"
            ),
        )

    send_sats = int((Decimal(total_sats) * Decimal("0.90")).to_integral_value(rounding="ROUND_DOWN"))
    if send_sats <= 0:
        raise HTTPException(status_code=400, detail="insufficient balance to send 90%")

    options: dict[str, Any] = {
        "replaceable": False,
        "lockUnspents": lock_unspents,
        "changeAddress": fee_index0,
        "add_inputs": False,
        "fee_rate": 3,  # sat/vB
    }
    outputs = {destination: _sats_to_btc_str(send_sats)}
    funded = await rpc.call(
        "walletcreatefundedpsbt",
        [utxos, outputs, 0, options],
        wallet=wallet,
    )
    if not isinstance(funded, dict) or not isinstance(funded.get("psbt"), str):
        raise HTTPException(status_code=502, detail="walletcreatefundedpsbt invalid response")

    fee_btc = funded.get("fee")
    fee_sats = 0
    try:
        fee_sats = int((Decimal(str(fee_btc or 0)) * Decimal(100_000_000)).to_integral_value())
    except Exception:
        fee_sats = 0

    change_sats = total_sats - send_sats - fee_sats
    if change_sats < 0:
        raise HTTPException(status_code=400, detail="insufficient funds after fee at 3 sat/vB")

    return {
        "psbt": funded["psbt"],
        "fee_index0": fee_index0,
        "utxo_count": len(utxos),
        "total_input_sats": total_sats,
        "send_sats": send_sats,
        "fee_sats": fee_sats,
        "change_sats": change_sats,
        "selected_inputs": utxos,
        "walletcreatefundedpsbt_response": funded,
    }


def _verify_master_password(raw: str) -> None:
    expected = (settings.adm_master_withdraw_password or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="adm master withdraw password not configured")
    if raw != expected:
        raise HTTPException(status_code=401, detail="invalid master password")


@router.post("/admin-withdraw/preview")
async def admin_withdraw_preview(
    req: AdminWithdrawPreviewRequest,
    _user: dict = Depends(get_adm_user),
) -> dict[str, Any]:
    rpc_step = "init"
    try:
        rpc_step = "verify_master_password"
        _verify_master_password(str(req.master_password or ""))
        rpc_step = "resolve_wallet_name"
        wallet = _wallet_name()
        if not wallet:
            raise HTTPException(status_code=503, detail="operator wallet not configured")
        rpc_step = "ensure_wallet_loaded"
        await _ensure_wallet_loaded(wallet)

        destination = str(req.destination_btc_address or "").strip()
        if not destination:
            raise HTTPException(status_code=422, detail="destination_btc_address is required")
        rpc_step = "validateaddress"
        valid = await rpc.call("validateaddress", [destination], wallet=wallet)
        if not isinstance(valid, Mapping) or not bool(valid.get("isvalid")):
            raise HTTPException(status_code=422, detail="invalid destination_btc_address")

        rpc_step = "build_admin_withdraw_psbt"
        built = await _build_admin_withdraw_psbt(
            wallet=wallet,
            destination=destination,
            lock_unspents=False,
        )
        return {
            "ok": True,
            "destination_btc_address": destination,
            "fee_rate_sat_vb": 3,
            "change_address": built["fee_index0"],
            "utxo_count": built["utxo_count"],
            "total_input_sats": built["total_input_sats"],
            "send_sats": built["send_sats"],
            "fee_sats": built["fee_sats"],
            "change_sats": built["change_sats"],
            "rpc_debug": {
                "validateaddress_response": valid,
                "selected_inputs": built["selected_inputs"],
                "walletcreatefundedpsbt_response": built["walletcreatefundedpsbt_response"],
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"admin withdraw preview failed at {rpc_step}: {str(exc)[:512]}",
        ) from exc


@router.post("/admin-withdraw/execute")
async def admin_withdraw_execute(
    req: AdminWithdrawPreviewRequest,
    _user: dict = Depends(get_adm_user),
) -> dict[str, Any]:
    rpc_step = "init"
    try:
        rpc_step = "verify_master_password"
        _verify_master_password(str(req.master_password or ""))
        rpc_step = "resolve_wallet_name"
        wallet = _wallet_name()
        if not wallet:
            raise HTTPException(status_code=503, detail="operator wallet not configured")
        rpc_step = "ensure_wallet_loaded"
        await _ensure_wallet_loaded(wallet)

        destination = str(req.destination_btc_address or "").strip()
        if not destination:
            raise HTTPException(status_code=422, detail="destination_btc_address is required")
        rpc_step = "validateaddress"
        valid = await rpc.call("validateaddress", [destination], wallet=wallet)
        if not isinstance(valid, Mapping) or not bool(valid.get("isvalid")):
            raise HTTPException(status_code=422, detail="invalid destination_btc_address")

        rpc_step = "build_admin_withdraw_psbt"
        built = await _build_admin_withdraw_psbt(
            wallet=wallet,
            destination=destination,
            lock_unspents=True,
        )
        rpc_step = "walletprocesspsbt"
        processed = await rpc.call("walletprocesspsbt", [built["psbt"]], wallet=wallet)
        if not isinstance(processed, Mapping) or not isinstance(processed.get("psbt"), str):
            raise HTTPException(status_code=502, detail="walletprocesspsbt invalid response")
        rpc_step = "finalizepsbt"
        finalized = await rpc.call("finalizepsbt", [processed["psbt"]], wallet=wallet)
        if not isinstance(finalized, Mapping) or not finalized.get("complete") or not isinstance(finalized.get("hex"), str):
            raise HTTPException(status_code=502, detail="finalizepsbt incomplete response")
        rpc_step = "sendrawtransaction"
        txid = await rpc.call("sendrawtransaction", [finalized["hex"]], wallet=wallet)
        txid_str = str(txid or "").strip()
        if not txid_str:
            raise HTTPException(status_code=502, detail="sendrawtransaction invalid response")
        return {
            "ok": True,
            "txid": txid_str,
            "destination_btc_address": destination,
            "fee_rate_sat_vb": 3,
            "change_address": built["fee_index0"],
            "utxo_count": built["utxo_count"],
            "total_input_sats": built["total_input_sats"],
            "send_sats": built["send_sats"],
            "fee_sats": built["fee_sats"],
            "change_sats": built["change_sats"],
            "rpc_debug": {
                "validateaddress_response": valid,
                "selected_inputs": built["selected_inputs"],
                "walletcreatefundedpsbt_response": built["walletcreatefundedpsbt_response"],
                "walletprocesspsbt_response": processed,
                "finalizepsbt_response": finalized,
                "sendrawtransaction_response": txid,
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"admin withdraw execute failed at {rpc_step}: {str(exc)[:512]}",
        ) from exc
