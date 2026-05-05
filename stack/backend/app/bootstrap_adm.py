"""Semeia o primeiro admin depois das migrations.

Ordem no arranque (`main.py`): `run_db_migrations()` cria `adm_users` (Alembic), depois esta
função insere uma linha se a tabela estiver vazia e `ADM_BOOTSTRAP_PASSWORD` existir.
"""

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminUser
from app.passwords import hash_password
from app.settings import settings

logger = logging.getLogger(__name__)


async def bootstrap_admin_if_empty(session: AsyncSession) -> None:
    cnt = await session.scalar(select(func.count(AdminUser.id)))
    if (cnt or 0) > 0:
        return

    raw = settings.adm_bootstrap_password
    if not raw:
        logger.warning(
            "Tabela adm_users vazia e ADM_BOOTSTRAP_PASSWORD não definida — "
            "cria um admin manualmente ou define a variável de ambiente."
        )
        return

    user = AdminUser(
        username=settings.adm_bootstrap_username.strip(),
        password_hash=hash_password(raw),
    )
    session.add(user)
    await session.commit()
    logger.info("Utilizador admin inicial criado: %s", user.username)
