"""Cria a tabela adm_users (primeiro admin da app).

PARA INICIANTES — como a tabela `adm_users` aparece no projeto:

1. **No código Python (modelo ORM)** — `app/models/__init__.py`, classe `AdminUser`:
   - `__tablename__ = "adm_users"` → nome da tabela no MariaDB.
   - Colunas: `id`, `username`, `password_hash`, `created_at`.
   Isto não cria a tabela sozinha na BD; só descreve como o SQLAlchemy mapeia linhas.

2. **Nesta migration** — quando corre `alembic upgrade head` (ou o arranque da API chama o mesmo),
   o Alembic executa `upgrade()` abaixo: `CREATE TABLE adm_users (...)` no servidor MariaDB.

3. **Dados iniciais** — depois da tabela existir, `app/bootstrap_adm.py` pode inserir o primeiro
   utilizador se a tabela estiver vazia e `ADM_BOOTSTRAP_PASSWORD` estiver definido.

Antigamente a tabela era criada com `Base.metadata.create_all()` no startup (sem ficheiros de
histórico). Agora o schema está versionado aqui, como migrations no Laravel.

Revision ID: 001_initial_adm_users
Revises:
Create Date: 2026-02-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# Identificadores da revisão — o Alembic encadeia `down_revision` para saber a ordem.
revision: str = "001_initial_adm_users"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Aplica alterações: aqui, criar a tabela vazia."""
    bind = op.get_bind()
    existing = sa.inspect(bind).get_table_names()
    # Se já existias `adm_users` de um arranque antigo com `create_all()` sem Alembic, não
    # repetimos o CREATE — o Alembic regista na mesma a revisão em `alembic_version`.
    if "adm_users" in existing:
        return

    op.create_table(
        "adm_users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    # No modelo: `unique=True, index=True` em `username` → um índice UNIQUE em MariaDB.
    op.create_index(
        op.f("ix_adm_users_username"),
        "adm_users",
        ["username"],
        unique=True,
    )


def downgrade() -> None:
    """Reverte esta revisão (útil em dev): apaga a tabela e o índice."""
    op.drop_index(op.f("ix_adm_users_username"), table_name="adm_users")
    op.drop_table("adm_users")
