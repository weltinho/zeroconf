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
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


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
    fee_rate_sat_vb: Mapped[int] = mapped_column(BigInteger(), nullable=False, server_default="2")

    # Estados simples para o MVP.
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    payout_txid: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text(), nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
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
