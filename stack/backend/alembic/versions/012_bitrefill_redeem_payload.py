"""Texto de resgate gift card Bitrefill (payload devolvido ao cliente).

Revision ID: 012_bitrefill_redeem_payload
Revises: 011_bitrefill_created_at
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012_bitrefill_redeem_payload"
down_revision: Union[str, Sequence[str], None] = "011_bitrefill_created_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "swap_order_bitrefill" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("swap_order_bitrefill")}
    if "bitrefill_redeem_payload" in cols:
        return
    op.add_column(
        "swap_order_bitrefill",
        sa.Column("bitrefill_redeem_payload", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "swap_order_bitrefill" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("swap_order_bitrefill")}
    if "bitrefill_redeem_payload" not in cols:
        return
    op.drop_column("swap_order_bitrefill", "bitrefill_redeem_payload")
