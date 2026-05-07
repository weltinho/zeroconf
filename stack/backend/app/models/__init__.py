"""
Modelos SQLAlchemy (camada ORM).

PARA INICIANTES:
- **Isto não é o mesmo que uma "migration".** Aqui defines *classes Python* que o SQLAlchemy
  usa para gerar SQL em runtime (SELECT/INSERT/UPDATE). O esquema físico da BD (CREATE TABLE)
  fica versionado em `stack/backend/alembic/versions/` — ver o ficheiro que cria `adm_users`.
- Mantém modelo e migrations alinhados: quando mudares colunas aqui, gera uma nova revisão
  Alembic (`alembic revision --autogenerate`) em vez de alterar tabelas à mão no MariaDB.
"""

import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Classe base: todas as tabelas declarativas registam-se em `Base.metadata`."""

    pass


class AdminUser(Base):
    """Utilizadores da área admin — tabela física `adm_users` (criada pela migration inicial)."""

    __tablename__ = "adm_users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class SwapOrder(Base):
    """Ordem de troca (MVP): cliente deposita BTC para receber um envio final."""

    __tablename__ = "swap_orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Input do cliente (já normalizado para sats).
    output_sats: Mapped[int] = mapped_column(BigInteger(), nullable=False)
    destination_btc_address: Mapped[str] = mapped_column(String(128), nullable=False)

    # Gerado pela nossa wallet (endereço de depósito).
    deposit_btc_address: Mapped[str] = mapped_column(String(128), unique=True, index=True)

    # Quanto esperamos receber para cobrir output + fee.
    required_deposit_sats: Mapped[int] = mapped_column(BigInteger(), nullable=False)
    # Quanto o cliente realmente depositou (soma dos UTXOs encontrados).
    actual_deposit_sats: Mapped[int | None] = mapped_column(BigInteger(), nullable=True)
    fee_rate_sat_vb: Mapped[int] = mapped_column(BigInteger(), nullable=False, server_default="2")

    # Provedor: 'internal' (fluxo padrão) ou 'boltz' (submarine swap externo).
    provider: Mapped[str] = mapped_column(String(24), nullable=False, server_default="internal", index=True)
    # Referência lógica no provedor (ex.: boltz_swap_id). Nulo para provider=internal.
    provider_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

    # Estados simples para o MVP.
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    payout_txid: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text(), nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    boltz_details: Mapped["SwapOrderBoltz | None"] = relationship(
        "SwapOrderBoltz", back_populates="order", uselist=False
    )


class SwapOrderLog(Base):
    """Log técnico das etapas do processamento de uma ordem de swap."""

    __tablename__ = "swap_order_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("swap_orders.id"), index=True, nullable=False)
    stage: Mapped[str] = mapped_column(String(96), index=True, nullable=False)
    message: Mapped[str | None] = mapped_column(Text(), nullable=True)
    details_json: Mapped[str | None] = mapped_column(Text(), nullable=True)
    auxiliary_info: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class SwapOrderBoltz(Base):
    """Metadados específicos de ordens processadas via Boltz (submarine swap)."""

    __tablename__ = "swap_order_boltz"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    swap_order_id: Mapped[int] = mapped_column(
        ForeignKey("swap_orders.id"), unique=True, index=True, nullable=False
    )

    # Identificadores Boltz.
    boltz_swap_id: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    pair_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pair_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Invoice LN enviada pelo cliente.
    invoice_bolt11: Mapped[str | None] = mapped_column(Text(), nullable=True)

    # Endereço de lockup gerado pela Boltz (onde o cliente deposita on-chain).
    lockup_address: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

    # Valor esperado on-chain (em sats) para cobrir a invoice + fees Boltz.
    expected_onchain_amount_sat: Mapped[int | None] = mapped_column(BigInteger(), nullable=True)

    # Estado bruto retornado pela Boltz (ex.: "invoice.set", "transaction.mempool").
    status_raw: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Último payload JSON completo retornado pela Boltz (para diagnóstico).
    last_payload_json: Mapped[str | None] = mapped_column(Text(), nullable=True)

    # Keypair secp256k1 gerado por swap — necessário para assinar tx de refund.
    # A pubkey (compressed, 33B hex) é enviada à Boltz no create_submarine_swap.
    # A privkey fica armazenada aqui (hex, 32B) para uso futuro no refund.
    refund_pubkey_hex: Mapped[str | None] = mapped_column(String(66), nullable=True)
    refund_privkey_hex: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # TXIDs on-chain do swap: depósito do cliente → lockup Boltz e claim Boltz.
    deposit_tx_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lockup_tx_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    claim_tx_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    order: Mapped["SwapOrder"] = relationship("SwapOrder", back_populates="boltz_details")
