"""Adiciona suporte a provider Boltz: colunas provider/provider_id em swap_orders
e nova tabela swap_order_boltz com metadados Boltz.

Revision ID: 005_boltz_provider
Revises: 004_swap_order_logs_auxiliary_info
Create Date: 2026-05-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_boltz_provider"
down_revision: Union[str, Sequence[str], None] = "004_swap_logs_aux_info"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # --- Adiciona colunas provider e provider_id em swap_orders ---
    if "swap_orders" in existing_tables:
        existing_cols = {c["name"] for c in inspector.get_columns("swap_orders")}
        if "provider" not in existing_cols:
            op.add_column(
                "swap_orders",
                sa.Column(
                    "provider",
                    sa.String(length=24),
                    nullable=False,
                    server_default="internal",
                ),
            )
            op.create_index("ix_swap_orders_provider", "swap_orders", ["provider"], unique=False)
        if "provider_id" not in existing_cols:
            op.add_column(
                "swap_orders",
                sa.Column("provider_id", sa.String(length=128), nullable=True),
            )
            op.create_index(
                "ix_swap_orders_provider_id", "swap_orders", ["provider_id"], unique=False
            )

    # --- Cria tabela swap_order_boltz ---
    if "swap_order_boltz" not in existing_tables:
        op.create_table(
            "swap_order_boltz",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("swap_order_id", sa.Integer(), nullable=False),
            sa.Column("boltz_swap_id", sa.String(length=128), nullable=False),
            sa.Column("pair_id", sa.String(length=32), nullable=True),
            sa.Column("pair_hash", sa.String(length=128), nullable=True),
            sa.Column("invoice_bolt11", sa.Text(), nullable=True),
            sa.Column("lockup_address", sa.String(length=128), nullable=True),
            sa.Column("expected_onchain_amount_sat", sa.BigInteger(), nullable=True),
            sa.Column("status_raw", sa.String(length=64), nullable=True),
            sa.Column("last_payload_json", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["swap_order_id"], ["swap_orders.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_swap_order_boltz_swap_order_id",
            "swap_order_boltz",
            ["swap_order_id"],
            unique=True,
        )
        op.create_index(
            "ix_swap_order_boltz_boltz_swap_id",
            "swap_order_boltz",
            ["boltz_swap_id"],
            unique=True,
        )
        op.create_index(
            "ix_swap_order_boltz_lockup_address",
            "swap_order_boltz",
            ["lockup_address"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index("ix_swap_order_boltz_lockup_address", table_name="swap_order_boltz")
    op.drop_index("ix_swap_order_boltz_boltz_swap_id", table_name="swap_order_boltz")
    op.drop_index("ix_swap_order_boltz_swap_order_id", table_name="swap_order_boltz")
    op.drop_table("swap_order_boltz")

    op.drop_index("ix_swap_orders_provider_id", table_name="swap_orders")
    op.drop_index("ix_swap_orders_provider", table_name="swap_orders")
    op.drop_column("swap_orders", "provider_id")
    op.drop_column("swap_orders", "provider")
