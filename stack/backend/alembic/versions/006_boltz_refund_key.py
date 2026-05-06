"""Adiciona colunas refund_pubkey_hex e refund_privkey_hex em swap_order_boltz.

Revision ID: 006_boltz_refund_key
Revises: 005_boltz_provider
Create Date: 2026-05-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_boltz_refund_key"
down_revision: Union[str, Sequence[str], None] = "005_boltz_provider"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "swap_order_boltz" not in inspector.get_table_names():
        return

    existing_cols = {c["name"] for c in inspector.get_columns("swap_order_boltz")}

    if "refund_pubkey_hex" not in existing_cols:
        op.add_column(
            "swap_order_boltz",
            sa.Column("refund_pubkey_hex", sa.String(length=66), nullable=True),
        )

    if "refund_privkey_hex" not in existing_cols:
        op.add_column(
            "swap_order_boltz",
            sa.Column("refund_privkey_hex", sa.String(length=64), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("swap_order_boltz", "refund_privkey_hex")
    op.drop_column("swap_order_boltz", "refund_pubkey_hex")
