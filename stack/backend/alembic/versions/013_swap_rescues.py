"""Tabela dedicada para histórico de resgates operacionais.

Revision ID: 013_swap_rescues
Revises: 012_bitrefill_redeem_payload
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013_swap_rescues"
down_revision: Union[str, Sequence[str], None] = "012_bitrefill_redeem_payload"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "swap_rescues" in inspector.get_table_names():
        return
    op.create_table(
        "swap_rescues",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(length=24), nullable=False),
        sa.Column("destination_btc_address", sa.String(length=128), nullable=False),
        sa.Column("rescue_txid", sa.String(length=128), nullable=False),
        sa.Column("rescued_sats", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["swap_orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_swap_rescues_order_id", "swap_rescues", ["order_id"], unique=False)
    op.create_index("ix_swap_rescues_rescue_txid", "swap_rescues", ["rescue_txid"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "swap_rescues" not in inspector.get_table_names():
        return
    try:
        op.drop_index("ix_swap_rescues_rescue_txid", table_name="swap_rescues")
    except Exception:
        pass
    try:
        op.drop_index("ix_swap_rescues_order_id", table_name="swap_rescues")
    except Exception:
        pass
    op.drop_table("swap_rescues")

