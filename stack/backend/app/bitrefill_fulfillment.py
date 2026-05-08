"""Extracção de dados de resgate (gift card / recarga) da resposta ``GET /invoices/{id}`` Bitrefill."""

from __future__ import annotations

from typing import Any


def extract_redeem_payload_from_invoice(raw: Any) -> str | None:
    """Devolve texto multi-linha com código/PIN/link/instruções, ou None se ainda não houver dados."""

    if not isinstance(raw, dict):
        return None
    data = raw.get("data")
    if not isinstance(data, dict):
        return None

    candidates: list[dict[str, Any]] = []
    for key in ("orders", "order"):
        v = data.get(key)
        if isinstance(v, list):
            for item in v:
                if isinstance(item, dict):
                    candidates.append(item)
        elif isinstance(v, dict):
            candidates.append(v)

    chunks: list[str] = []
    for o in candidates:
        red = o.get("redemption_info") or o.get("redemptionInfo")
        if not isinstance(red, dict):
            continue
        code = red.get("code") or red.get("secret") or red.get("voucher")
        pin = red.get("pin")
        link = red.get("link") or red.get("url")
        instr = red.get("instructions") or red.get("instruction")
        if not any(x for x in (code, pin, link, instr) if x is not None and str(x).strip()):
            continue
        parts: list[str] = []
        if code:
            parts.append(f"Código: {code}")
        if pin:
            parts.append(f"PIN: {pin}")
        if link:
            parts.append(f"Link: {link}")
        if instr:
            parts.append(str(instr).strip())
        if parts:
            chunks.append("\n".join(parts))

    if not chunks:
        return None
    return "\n\n".join(chunks).strip()
