"""Adiciona colunas lockup_tx_id e claim_tx_id em swap_order_boltz.

Revision ID: 007_boltz_tx_ids
Revises: 006_boltz_refund_key
Create Date: 2026-05-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_boltz_tx_ids"
down_revision: Union[str, Sequence[str], None] = "006_boltz_refund_key"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "swap_order_boltz" not in inspector.get_table_names():
        return

    existing_cols = {c["name"] for c in inspector.get_columns("swap_order_boltz")}

    if "lockup_tx_id" not in existing_cols:
        op.add_column(
            "swap_order_boltz",
            sa.Column("lockup_tx_id", sa.String(64), nullable=True),
        )

    if "claim_tx_id" not in existing_cols:
        op.add_column(
            "swap_order_boltz",
            sa.Column("claim_tx_id", sa.String(64), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "swap_order_boltz" not in inspector.get_table_names():
        return

    existing_cols = {c["name"] for c in inspector.get_columns("swap_order_boltz")}

    if "claim_tx_id" in existing_cols:
        op.drop_column("swap_order_boltz", "claim_tx_id")

    if "lockup_tx_id" in existing_cols:
        op.drop_column("swap_order_boltz", "lockup_tx_id")
