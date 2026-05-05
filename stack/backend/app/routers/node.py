"""Painel do operador: estado da cadeia e carteira — sem passthrough RPC genérico."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

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
