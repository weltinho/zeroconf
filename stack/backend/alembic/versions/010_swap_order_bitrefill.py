"""Tabela swap_order_bitrefill para ordens «Compras» (Bitrefill).

Revision ID: 010_swap_order_bitrefill
Revises: 009_actual_deposit_sats
Create Date: 2026-05-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010_swap_order_bitrefill"
down_revision: Union[str, Sequence[str], None] = "009_actual_deposit_sats"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "swap_order_bitrefill" in existing:
        return

    op.create_table(
        "swap_order_bitrefill",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("swap_order_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.String(length=128), nullable=False),
        sa.Column("package_id", sa.String(length=384), nullable=True),
        sa.Column("product_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("customer_email", sa.String(length=255), nullable=False),
        sa.Column("recipient_phone", sa.String(length=48), nullable=True),
        sa.Column("refund_btc_address", sa.String(length=128), nullable=False),
        sa.Column("quoted_price_sats", sa.BigInteger(), nullable=False),
        sa.Column(
            "bitrefill_invoice_id",
            sa.String(length=160),
            nullable=True,
            index=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["swap_order_id"], ["swap_orders.id"]),
        sa.UniqueConstraint("swap_order_id", name="uq_swap_order_bitrefill_order"),
    )
    op.create_index(
        op.f("ix_swap_order_bitrefill_swap_order_id"),
        "swap_order_bitrefill",
        ["swap_order_id"],
        unique=True,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "swap_order_bitrefill" not in existing:
        return

    op.drop_index(op.f("ix_swap_order_bitrefill_swap_order_id"), table_name="swap_order_bitrefill")
    op.drop_table("swap_order_bitrefill")
