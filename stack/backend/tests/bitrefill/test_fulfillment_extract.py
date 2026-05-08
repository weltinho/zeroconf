"""Testes para extração de dados de resgate a partir de GET /invoices/{id}."""

from app.bitrefill_fulfillment import extract_redeem_payload_from_invoice


def test_extract_redemption_info_code_pin() -> None:
    raw = {
        "data": {
            "orders": [
                {
                    "redemption_info": {
                        "code": "ABC-123",
                        "pin": "9999",
                        "link": "https://example.com/r",
                    }
                }
            ]
        }
    }
    out = extract_redeem_payload_from_invoice(raw)
    assert out is not None
    assert "Código: ABC-123" in out
    assert "PIN: 9999" in out
    assert "Link: https://example.com/r" in out


def test_extract_redemption_info_camel_case_key() -> None:
    raw = {"data": {"order": {"redemptionInfo": {"voucher": "VC-1", "instructions": "Ligue 0800"}}}}
    out = extract_redeem_payload_from_invoice(raw)
    assert out is not None
    assert "Código: VC-1" in out
    assert "Ligue 0800" in out


def test_extract_skips_orders_without_redemption_dict() -> None:
    raw = {"data": {"orders": [{"id": "x", "status": "paid"}]}}
    assert extract_redeem_payload_from_invoice(raw) is None


def test_extract_invalid_top_level() -> None:
    assert extract_redeem_payload_from_invoice(None) is None
    assert extract_redeem_payload_from_invoice({"data": "nope"}) is None
