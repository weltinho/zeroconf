"""Resolução de Lightning Address / LNURL para invoice BOLT11.

Suporta:
  - Lightning Address: user@domain  → GET /.well-known/lnurlp/user → callback → pr
  - LNURL bech32 (lnurl1...)        → decode → GET URL → callback → pr

Lança LnurlError com mensagem legível em qualquer passo de falha.
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = 10


class LnurlError(Exception):
    """Erro durante resolução de LNURL/Lightning Address."""


def _is_lightning_address(value: str) -> bool:
    parts = value.strip().split("@")
    return len(parts) == 2 and "." in parts[1] and " " not in value


def _is_lnurl(value: str) -> bool:
    return value.strip().lower().startswith("lnurl1")


def _decode_lnurl(lnurl: str) -> str:
    """Decodifica LNURL bech32 para URL sem dependências externas."""
    # LNURL é bech32 com hrp="lnurl". Charset bech32:
    CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
    data = lnurl.strip().lower()
    # remove hrp
    sep = data.rfind("1")
    if sep < 1:
        raise LnurlError("LNURL inválido: separador não encontrado")
    dp = data[sep + 1:]
    decoded = []
    for c in dp:
        idx = CHARSET.find(c)
        if idx < 0:
            raise LnurlError(f"LNURL inválido: caractere inesperado '{c}'")
        decoded.append(idx)
    # converta de 5 bits para 8 bits
    acc, bits, result = 0, 0, []
    for val in decoded[:-6]:  # remove checksum (6 chars)
        acc = ((acc << 5) | val) & 0xFFF
        bits += 5
        while bits >= 8:
            bits -= 8
            result.append((acc >> bits) & 0xFF)
    return bytes(result).decode("utf-8")


async def resolve_to_invoice(destination: str, amount_sats: int, comment: str = "") -> str:
    """Resolve Lightning Address ou LNURL para invoice BOLT11.

    Args:
        destination: Lightning Address (user@domain) ou LNURL (lnurl1...).
        amount_sats: Valor em satoshis a pagar.
        comment: Comentário opcional (enviado se commentAllowed >= len).

    Returns:
        Invoice BOLT11 (string começando com ln...).

    Raises:
        LnurlError: Em qualquer falha de resolução.
    """
    destination = destination.strip()
    amount_msat = amount_sats * 1000

    # 1. Obter URL de metadata
    if _is_lightning_address(destination):
        username, domain = destination.split("@", 1)
        metadata_url = f"https://{domain}/.well-known/lnurlp/{username}"
    elif _is_lnurl(destination):
        try:
            metadata_url = _decode_lnurl(destination)
        except LnurlError:
            raise
        except Exception as exc:
            raise LnurlError("Não foi possível decodificar o LNURL") from exc
    else:
        raise LnurlError("Formato não reconhecido: use user@domínio ou LNURL")

    # 2. Buscar metadata / callback
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            meta_resp = await client.get(metadata_url)
    except Exception as exc:
        logger.warning("LNURL metadata fetch failed for %s: %s", metadata_url, exc)
        raise LnurlError("Não foi possível gerar a invoice, verifique o endereço") from exc

    if not meta_resp.is_success:
        raise LnurlError("Não foi possível gerar a invoice, verifique o endereço")

    try:
        meta = meta_resp.json()
    except Exception as exc:
        raise LnurlError("Não foi possível gerar a invoice, verifique o endereço") from exc

    callback: str | None = meta.get("callback")
    if not callback:
        raise LnurlError("Não foi possível gerar a invoice, verifique o endereço")

    # Validar limites se disponíveis
    min_sendable = meta.get("minSendable", 0)
    max_sendable = meta.get("maxSendable", float("inf"))
    if amount_msat < min_sendable:
        min_sats = min_sendable // 1000
        raise LnurlError(f"Valor abaixo do mínimo permitido pelo destinatário ({min_sats} sats)")
    if amount_msat > max_sendable:
        max_sats = max_sendable // 1000
        raise LnurlError(f"Valor acima do máximo permitido pelo destinatário ({max_sats} sats)")

    # 3. Chamar callback para obter invoice
    params: dict[str, str] = {"amount": str(amount_msat)}
    comment_allowed: int = int(meta.get("commentAllowed", 0))
    if comment and comment_allowed and len(comment) <= comment_allowed:
        params["comment"] = comment

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            cb_resp = await client.get(callback, params=params)
    except Exception as exc:
        logger.warning("LNURL callback failed for %s: %s", callback, exc)
        raise LnurlError("Não foi possível gerar a invoice, verifique o endereço") from exc

    if not cb_resp.is_success:
        raise LnurlError("Não foi possível gerar a invoice, verifique o endereço")

    try:
        cb_data = cb_resp.json()
    except Exception as exc:
        raise LnurlError("Não foi possível gerar a invoice, verifique o endereço") from exc

    if cb_data.get("status") == "ERROR":
        reason = cb_data.get("reason", "")
        raise LnurlError(f"Não foi possível gerar a invoice: {reason}" if reason else "Não foi possível gerar a invoice, verifique o endereço")

    invoice: str | None = cb_data.get("pr")
    if not invoice:
        raise LnurlError("Não foi possível gerar a invoice, verifique o endereço")

    # Detectar BOLT12 offer (começa com 'lno') — não suportado por submarine swaps.
    if invoice.lower().startswith("lno"):
        raise LnurlError(
            "O destinatário usa BOLT12 (offer), que não é compatível com submarine swaps. "
            "Use um Lightning Address de outro provedor ou cole uma invoice BOLT11 direta."
        )

    # Validação mínima: deve começar com 'ln'
    if not invoice.lower().startswith("ln"):
        raise LnurlError("Invoice retornada pelo destinatário é inválida.")

    return invoice
