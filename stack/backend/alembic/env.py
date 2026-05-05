"""
Ambiente Alembic — executado quando corres no terminal `alembic upgrade head` ou quando a API
chama as migrações no arranque (`app.db.run_db_migrations`).

--------------------------------------------------------------------------------
Modelagem em Python vs migrations (estilo Laravel)
--------------------------------------------------------------------------------

**1) Model (ORM)** — ficheiros como `app/models/__init__.py`

- Definis classes (`AdminUser`, etc.) com colunas em Python.
- Isto diz à aplicação *como* ler e escrever linhas (objetos Python ↔ colunas SQL).
- `__tablename__ = "adm_users"` escolhe o nome físico da tabela no MariaDB.

**2) Migration (Alembic)** — pasta `alembic/versions/*.py`

- Cada revisão é um passo no *histórico* da base de dados (criar tabela, acrescentar coluna…).
- É o equivalente a `database/migrations/*.php` no Laravel: versionado, repetível, auditável.
- Em equipa, todos aplicam as mesmas revisões com `alembic upgrade head`.

**3) O que *não* fazer**

- Não depender só de `Base.metadata.create_all()` em produção: não gera histórico nem resolve
  conflitos entre ambientes. Por isso passámos a usar Alembic.

**Fluxo de trabalho típico depois de alterares um modelo**

1. Editar o modelo em Python.
2. `alembic revision --autogenerate -m "add_email_to_users"` (gera um rascunho a partir de `Base.metadata`).
3. Abrir o ficheiro novo em `versions/`, rever o SQL (autogenerate às vezes erra).
4. `alembic upgrade head` — ou deixar a API aplicar no startup.

--------------------------------------------------------------------------------
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Metadata com todas as tabelas declaradas em modelos que herdam `Base` — necessário
# para `alembic revision --autogenerate` comparar modelo vs base real.
from app.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    """Mesma URL async que a app (`mysql+aiomysql://...`)."""
    from app.settings import settings

    # ConfigParser do alembic.ini interpreta `%`; passwords URL-encoded usam % → duplicar.
    return settings.async_database_url.replace("%", "%%")


def run_migrations_offline() -> None:
    """Modo 'offline': escreve SQL para stdout/ficheiro sem ligar ao servidor (CI/docs)."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Alembic corre em modo sync; o SQLAlchemy async expõe esta callback sobre a ligação."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Liga com o motor async (aiomysql) e executa as migrações."""
    section = config.get_section(config.config_ini_section) or {}
    section["sqlalchemy.url"] = get_url()
    connectable = async_engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Entrada síncrona que o CLI Alembic invoca (`alembic upgrade`)."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
