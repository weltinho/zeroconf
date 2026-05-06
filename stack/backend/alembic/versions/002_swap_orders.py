"""Cria a tabela swap_orders (MVP da área do cliente).

Revision ID: 002_swap_orders
Revises: 001_initial_adm_users
Create Date: 2026-05-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_swap_orders"
down_revision: Union[str, Sequence[str], None] = "001_initial_adm_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = sa.inspect(bind).get_table_names()
    if "swap_orders" in existing:
        return

    op.create_table(
        "swap_orders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("output_sats", sa.BigInteger(), nullable=False),
        sa.Column("destination_btc_address", sa.String(length=128), nullable=False),
        sa.Column("deposit_btc_address", sa.String(length=128), nullable=False),
        sa.Column("required_deposit_sats", sa.BigInteger(), nullable=False),
        sa.Column(
            "fee_rate_sat_vb",
            sa.BigInteger(),
            server_default=sa.text("2"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("payout_txid", sa.String(length=128), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_swap_orders_status"), "swap_orders", ["status"], unique=False)
    op.create_index(
        op.f("ix_swap_orders_deposit_btc_address"),
        "swap_orders",
        ["deposit_btc_address"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_swap_orders_deposit_btc_address"), table_name="swap_orders")
    op.drop_index(op.f("ix_swap_orders_status"), table_name="swap_orders")
    op.drop_table("swap_orders")

