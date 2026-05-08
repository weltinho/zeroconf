"""Coluna created_at em swap_order_bitrefill (alinhada ao modelo ORM).

Revision ID: 011_bitrefill_created_at
Revises: 010_swap_order_bitrefill
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011_bitrefill_created_at"
down_revision: Union[str, Sequence[str], None] = "010_swap_order_bitrefill"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "swap_order_bitrefill" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("swap_order_bitrefill")}
    if "created_at" in cols:
        return
    op.add_column(
        "swap_order_bitrefill",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "swap_order_bitrefill" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("swap_order_bitrefill")}
    if "created_at" not in cols:
        return
    op.drop_column("swap_order_bitrefill", "created_at")
