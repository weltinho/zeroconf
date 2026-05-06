"""Adiciona coluna auxiliary_info em swap_order_logs.

Revision ID: 004_swap_logs_aux_info
Revises: 003_swap_order_logs
Create Date: 2026-05-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_swap_logs_aux_info"
down_revision: Union[str, Sequence[str], None] = "003_swap_order_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("swap_order_logs")}
    if "auxiliary_info" in cols:
        return
    op.add_column("swap_order_logs", sa.Column("auxiliary_info", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("swap_order_logs", "auxiliary_info")

