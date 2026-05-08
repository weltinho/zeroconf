"""Testes leves para overlay de demo signet (sem RPC)."""

import struct

from app.signet_demo import (
    boltz_get_response_demo_overlay,
    bitrefill_get_order_demo_overlay,
    normalize_boltz_demo_state,
    normalize_bitrefill_demo_state,
    parse_bolt11_invoice_sats,
    parse_signet_demo_order_id_from_decoded_tx,
    signet_demo_opreturn_payload_hex,
    signet_demo_verify_trigger_decoded,
)

_payload = b"BCSD" + struct.pack(">Q", 4242)


def test_signet_demo_opreturn_roundtrip() -> None:
    h = signet_demo_opreturn_payload_hex(4242)
    assert bytes.fromhex(h) == _payload
    dec = {
        "vout": [
            {
                "scriptPubKey": {
                    "type": "nulldata",
                    "asm": f"OP_RETURN {h}",
                }
            }
        ]
    }
    assert parse_signet_demo_order_id_from_decoded_tx(dec) == 4242


def test_signet_demo_verify_trigger() -> None:
    dec = {
        "vout": [
            {"scriptPubKey": {"type": "pubkeyhash", "addresses": ["tb1qaaa"]}, "value": 0.00005},
            {"scriptPubKey": {"type": "nulldata", "asm": f"OP_RETURN {signet_demo_opreturn_payload_hex(7)}"}},
        ]
    }
    assert signet_demo_verify_trigger_decoded(
        sink="tb1qaaa", order_id=7, required_deposit_sats=4000, decoded=dec
    )
    assert not signet_demo_verify_trigger_decoded(
        sink="tb1qaaa", order_id=8, required_deposit_sats=4000, decoded=dec
    )


def test_parse_bolt11_invoice_sats_lntb() -> None:
    inv = "lntb1500n1p0fakeinvoice"
    assert parse_bolt11_invoice_sats(inv) == 150


def test_normalize_boltz_demo_state() -> None:
    assert normalize_boltz_demo_state("  paid_out ") == "paid_out"
    assert normalize_boltz_demo_state("nope") is None


def test_boltz_overlay_paid_out() -> None:
    base = {
        "order_id": 1,
        "status": "awaiting_deposit",
        "boltz_swap_id": "x",
        "our_deposit_address": "tb1aaa",
        "deposit_btc_address": "tb1bbb",
        "required_deposit_sats": 5000,
        "expected_onchain_amount_sat": 4000,
        "status_raw": "invoice.set",
        "deposit_tx_id": None,
        "lockup_tx_id": None,
        "preimage": None,
    }
    out = boltz_get_response_demo_overlay(base=base, demo_state="paid_out", order_id=1)
    assert out["status"] == "paid_out"
    assert out["preimage"] is not None
    assert len(out["preimage"]) == 64
    assert out["deposit_tx_id"] is not None


def test_bitrefill_overlay_confirming() -> None:
    base = {
        "order_id": 2,
        "status": "awaiting_deposit",
        "deposit_btc_address": "tb1dep",
        "required_deposit_sats": 10_000,
        "output_sats": 8000,
        "destination_btc_address": "BITREFILL_PENDING",
        "payout_txid": None,
        "last_rpc_status": None,
        "provider": "bitrefill",
    }
    out = bitrefill_get_order_demo_overlay(base=base, demo_state="confirming", order_id=2)
    assert out["status"] == "confirming"
    assert out["payout_txid"] is not None


def test_bitrefill_overlay_paid_out_sets_gift_line() -> None:
    base = {
        "order_id": 3,
        "status": "awaiting_deposit",
        "deposit_btc_address": "tb1dep",
        "required_deposit_sats": 10_000,
        "output_sats": 8000,
        "destination_btc_address": "BITREFILL_PENDING",
        "payout_txid": None,
        "last_rpc_status": None,
        "provider": "bitrefill",
        "bitrefill_gift_card_line": None,
    }
    out = bitrefill_get_order_demo_overlay(base=base, demo_state="paid_out", order_id=3)
    assert out["status"] == "paid_out"
    line = out.get("bitrefill_gift_card_line") or ""
    assert "Seu gift card" in line
    assert "Código demo Signet" in line


def test_bitrefill_overlay_paid_out_keeps_existing_gift_line() -> None:
    base = {
        "order_id": 3,
        "status": "awaiting_deposit",
        "deposit_btc_address": "tb1dep",
        "required_deposit_sats": 10_000,
        "output_sats": 8000,
        "destination_btc_address": "BITREFILL_PENDING",
        "payout_txid": None,
        "last_rpc_status": None,
        "provider": "bitrefill",
        "bitrefill_gift_card_line": "Seu gift card de Steam é:\nCódigo: KEEP-ME",
    }
    out = bitrefill_get_order_demo_overlay(base=base, demo_state="paid_out", order_id=3)
    assert out["bitrefill_gift_card_line"] == "Seu gift card de Steam é:\nCódigo: KEEP-ME"


def test_normalize_bitrefill_error() -> None:
    assert normalize_bitrefill_demo_state("error") == "error"
