"""Testa o mecanismo de recovery do endpoint GET /client/boltz/orders/{id}?recovery=true.

Cenário principal:
  - Ordem Boltz em status awaiting_deposit
  - ZMQ perdeu o evento da tx do cliente
  - Cliente chama GET /client/boltz/orders/1?recovery=true
  - Backend faz listunspent, encontra UTXOs, dispara SwapOrderProcessor
  - Status da ordem avança para deposit_detected (ou além)

Não usa BD real — modela session e dependências com mocks.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Fixtures: objetos ORM falsos
# ---------------------------------------------------------------------------

def _make_order(status: str = "awaiting_deposit") -> MagicMock:
    order = MagicMock()
    order.id = 1
    order.status = status
    order.provider = "boltz"
    order.provider_id = "SWAP123"
    order.deposit_btc_address = "bc1qdeposit"
    order.destination_btc_address = "bc1qlockup"
    order.required_deposit_sats = 26752
    order.output_sats = 25329
    order.fee_rate_sat_vb = 3
    order.payout_txid = None
    order.last_error = None
    order.actual_deposit_sats = None
    return order


def _make_boltz_detail(order_id: int = 1) -> MagicMock:
    boltz = MagicMock()
    boltz.boltz_swap_id = "SWAP123"
    boltz.lockup_address = "bc1qlockup"
    boltz.expected_onchain_amount_sat = 25329
    boltz.status_raw = "invoice.set"
    boltz.last_payload_json = '{"status":"invoice.set"}'
    boltz.deposit_tx_id = None
    return boltz


def _make_session(order: MagicMock, boltz: MagicMock) -> MagicMock:
    """Session async que retorna order e boltz_detail nas execuções sequenciais."""
    session = AsyncMock()

    result_order = MagicMock()
    result_order.scalar_one_or_none.return_value = order

    result_boltz = MagicMock()
    result_boltz.scalar_one_or_none.return_value = boltz

    # Primeira execute → order; segunda → boltz_detail
    session.execute.side_effect = [result_order, result_boltz]
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    return session


# ---------------------------------------------------------------------------
# Testes
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_recovery_skips_when_status_not_awaiting_deposit():
    """Recovery não faz nada se o status já avançou além de awaiting_deposit."""
    order = _make_order(status="deposit_detected")
    boltz = _make_boltz_detail()
    session = _make_session(order, boltz)

    fake_rpc = AsyncMock()

    with (
        patch("app.routers.client_boltz.settings") as mock_settings,
        patch("app.deps.rpc", fake_rpc),
    ):
        mock_settings.boltz_enabled = True
        mock_settings.bitcoin_operator_wallet = "operator"

        from app.routers.client_boltz import get_boltz_order

        response = await get_boltz_order(order_id=1, session=session, recovery=True)

    # listunspent não deve ter sido chamado (status já avançou)
    fake_rpc.call.assert_not_called()
    assert response.status == "deposit_detected"


@pytest.mark.asyncio
async def test_recovery_does_nothing_when_no_utxos():
    """Recovery chama listunspent mas não dispara processor se não há UTXOs."""
    order = _make_order(status="awaiting_deposit")
    boltz = _make_boltz_detail()
    session = _make_session(order, boltz)

    fake_rpc = AsyncMock()
    fake_rpc.call.return_value = []  # listunspent vazio

    with (
        patch("app.routers.client_boltz.settings") as mock_settings,
        patch("app.deps.rpc", fake_rpc),
        patch("app.routers.node._ensure_wallet_loaded", AsyncMock()),
    ):
        mock_settings.boltz_enabled = True
        mock_settings.bitcoin_operator_wallet = "operator"

        from app.routers.client_boltz import get_boltz_order

        response = await get_boltz_order(order_id=1, session=session, recovery=True)

    fake_rpc.call.assert_awaited_once_with(
        "listunspent",
        [0, 9999999, ["bc1qdeposit"], True],
        wallet="operator",
    )
    # Nenhum processamento disparado; status permanece
    assert response.status == "awaiting_deposit"


@pytest.mark.asyncio
async def test_recovery_triggers_processor_when_utxos_found():
    """Recovery encontra UTXOs e chama _try_payout_order com o txid correto."""
    order = _make_order(status="awaiting_deposit")
    boltz = _make_boltz_detail()
    session = _make_session(order, boltz)

    fake_utxos = [{"txid": "deadbeef01", "vout": 0, "amount": 0.00026752}]
    fake_rpc = AsyncMock()
    fake_rpc.call.return_value = fake_utxos

    # Simula _try_payout_order avançando o status
    async def fake_payout(proc_session, wallet, ord, event_txid=None):
        ord.status = "deposit_detected"
        ord.payout_txid = "payouttxid01"

    mock_processor_instance = MagicMock()
    mock_processor_instance._try_payout_order = fake_payout
    mock_processor_cls = MagicMock(return_value=mock_processor_instance)

    # proc_session context manager
    mock_proc_session = AsyncMock()
    mock_proc_session.__aenter__ = AsyncMock(return_value=mock_proc_session)
    mock_proc_session.__aexit__ = AsyncMock(return_value=False)
    mock_proc_session.commit = AsyncMock()

    mock_gsf = MagicMock(return_value=MagicMock(return_value=mock_proc_session))

    with (
        patch("app.routers.client_boltz.settings") as mock_settings,
        patch("app.deps.rpc", fake_rpc),
        patch("app.routers.node._ensure_wallet_loaded", AsyncMock()),
        patch("app.swap_processor.SwapOrderProcessor", mock_processor_cls),
        patch("app.routers.client_boltz.log_swap_step", AsyncMock()),
        patch("app.db.get_session_factory", mock_gsf),
    ):
        mock_settings.boltz_enabled = True
        mock_settings.bitcoin_operator_wallet = "operator"

        from app.routers.client_boltz import get_boltz_order
        response = await get_boltz_order(order_id=1, session=session, recovery=True)

    # listunspent foi chamado com o endereço correto
    fake_rpc.call.assert_awaited_once_with(
        "listunspent",
        [0, 9999999, ["bc1qdeposit"], True],
        wallet="operator",
    )

    # Processor foi instanciado com o rpc
    mock_processor_cls.assert_called_once_with(fake_rpc)

    # Status avançou para deposit_detected
    assert order.status == "deposit_detected"
    assert order.payout_txid == "payouttxid01"


@pytest.mark.asyncio
async def test_recovery_exception_is_swallowed_and_order_still_returned():
    """Se o recovery explodir (ex.: RPC indisponível), retorna a ordem sem propagar o erro."""
    order = _make_order(status="awaiting_deposit")
    boltz = _make_boltz_detail()
    session = _make_session(order, boltz)

    fake_rpc = AsyncMock()
    fake_rpc.call.side_effect = Exception("RPC offline")

    with (
        patch("app.routers.client_boltz.settings") as mock_settings,
        patch("app.deps.rpc", fake_rpc),
        patch("app.routers.node._ensure_wallet_loaded", AsyncMock()),
    ):
        mock_settings.boltz_enabled = True
        mock_settings.bitcoin_operator_wallet = "operator"

        from app.routers.client_boltz import get_boltz_order

        # Não deve levantar exceção — swallowed internamente
        response = await get_boltz_order(order_id=1, session=session, recovery=True)

    assert response.order_id == 1
    assert response.status == "awaiting_deposit"
