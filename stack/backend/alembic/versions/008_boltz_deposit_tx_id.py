"""Adiciona coluna deposit_tx_id em swap_order_boltz.

Revision ID: 008_boltz_deposit_tx_id
Revises: 007_boltz_tx_ids
Create Date: 2026-05-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008_boltz_deposit_tx_id"
down_revision: Union[str, Sequence[str], None] = "007_boltz_tx_ids"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "swap_order_boltz" not in inspector.get_table_names():
        return

    existing_cols = {c["name"] for c in inspector.get_columns("swap_order_boltz")}

    if "deposit_tx_id" not in existing_cols:
        op.add_column(
            "swap_order_boltz",
            sa.Column("deposit_tx_id", sa.String(64), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "swap_order_boltz" not in inspector.get_table_names():
        return

    existing_cols = {c["name"] for c in inspector.get_columns("swap_order_boltz")}

    if "deposit_tx_id" in existing_cols:
        op.drop_column("swap_order_boltz", "deposit_tx_id")
