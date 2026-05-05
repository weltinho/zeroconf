import asyncio
from collections.abc import AsyncGenerator
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.settings import settings

_engine = None
_session_factory = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.async_database_url,
            pool_pre_ping=True,
            pool_recycle=3600,
        )
    return _engine


def get_session_factory():
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _session_factory


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        yield session


def _alembic_config() -> Config:
    """Aponta para `alembic.ini` junto da pasta `app/` (WORKDIR /app no Docker)."""
    ini = Path(__file__).resolve().parent.parent / "alembic.ini"
    cfg = Config(str(ini))
    # Alembic ConfigParser: `%` na password URL-encoded tem de ser escapado.
    cfg.set_main_option("sqlalchemy.url", settings.async_database_url.replace("%", "%%"))
    return cfg


async def run_db_migrations() -> None:
    """Aplica todas as revisões pendentes (`alembic upgrade head`) sem bloquear o event loop.

    O trabalho pesado corre num thread pool porque `alembic.command.upgrade` é síncrono e o
    `env.py` usa `asyncio.run` por dentro — isolamento evita misturar loops asyncio.

    **BD já criada com `create_all()` antes de haver Alembic:** a tabela pode já existir mas a
    tabela `alembic_version` estar vazia — nesse caso corre uma vez (na máquina com acesso à BD):
    `alembic stamp 001_initial_adm_users` para marcar o estado actual sem repetir o CREATE TABLE,
    depois volta a usar só `upgrade`.
    """

    def _upgrade() -> None:
        command.upgrade(_alembic_config(), "head")

    await asyncio.to_thread(_upgrade)


async def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
