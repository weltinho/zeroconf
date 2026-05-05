"""
Modelos SQLAlchemy (camada ORM).

PARA INICIANTES:
- **Isto não é o mesmo que uma "migration".** Aqui defines *classes Python* que o SQLAlchemy
  usa para gerar SQL em runtime (SELECT/INSERT/UPDATE). O esquema físico da BD (CREATE TABLE)
  fica versionado em `stack/backend/alembic/versions/` — ver o ficheiro que cria `adm_users`.
- Mantém modelo e migrations alinhados: quando mudares colunas aqui, gera uma nova revisão
  Alembic (`alembic revision --autogenerate`) em vez de alterar tabelas à mão no MariaDB.
"""

import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Classe base: todas as tabelas declarativas registam-se em `Base.metadata`."""

    pass


class AdminUser(Base):
    """Utilizadores da área admin — tabela física `adm_users` (criada pela migration inicial)."""

    __tablename__ = "adm_users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
