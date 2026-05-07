"""Adiciona coluna actual_deposit_sats em swap_orders.

Revision ID: 009_actual_deposit_sats
Revises: 008_boltz_deposit_tx_id
Create Date: 2026-05-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_actual_deposit_sats"
down_revision: Union[str, Sequence[str], None] = "008_boltz_deposit_tx_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "swap_orders" not in inspector.get_table_names():
        return

    existing_cols = {c["name"] for c in inspector.get_columns("swap_orders")}

    if "actual_deposit_sats" not in existing_cols:
        op.add_column(
            "swap_orders",
            sa.Column("actual_deposit_sats", sa.BigInteger(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "swap_orders" not in inspector.get_table_names():
        return

    existing_cols = {c["name"] for c in inspector.get_columns("swap_orders")}

    if "actual_deposit_sats" in existing_cols:
        op.drop_column("swap_orders", "actual_deposit_sats")
