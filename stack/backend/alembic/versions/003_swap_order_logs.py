"""Cria a tabela swap_order_logs para trilha de execução por ordem.

Revision ID: 003_swap_order_logs
Revises: 002_swap_orders
Create Date: 2026-05-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_swap_order_logs"
down_revision: Union[str, Sequence[str], None] = "002_swap_orders"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = sa.inspect(bind).get_table_names()
    if "swap_order_logs" in existing:
        return

    op.create_table(
        "swap_order_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=96), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("details_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["order_id"], ["swap_orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_swap_order_logs_order_id"), "swap_order_logs", ["order_id"], unique=False)
    op.create_index(op.f("ix_swap_order_logs_stage"), "swap_order_logs", ["stage"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_swap_order_logs_stage"), table_name="swap_order_logs")
    op.drop_index(op.f("ix_swap_order_logs_order_id"), table_name="swap_order_logs")
    op.drop_table("swap_order_logs")

