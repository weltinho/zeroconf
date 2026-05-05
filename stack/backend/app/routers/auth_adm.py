from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_tokens import create_session_token, verify_session_token
from app.db import get_session
from app.models import AdminUser
from app.passwords import verify_password
from app.settings import settings

router = APIRouter(prefix="/auth/adm", tags=["auth-adm"])

_SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7


class LoginBody(BaseModel):
    username: str = Field(default="admin", min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


def require_admin_db(request: Request) -> None:
    if not getattr(request.app.state, "db_ok", False):
        raise HTTPException(
            status_code=503,
            detail="Base de dados indisponível — admin em modo degradado.",
        )


@router.post("/login")
async def adm_login(
    request: Request,
    response: Response,
    body: LoginBody,
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    require_admin_db(request)
    result = await db.execute(
        select(AdminUser).where(AdminUser.username == body.username.strip())
    )
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas.")

    token = create_session_token(user.id, user.username)
    response.set_cookie(
        key=settings.adm_cookie_name,
        value=token,
        max_age=_SESSION_COOKIE_MAX_AGE,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return {"ok": "true", "username": user.username}


@router.post("/logout")
async def adm_logout(response: Response) -> dict[str, str]:
    response.delete_cookie(
        key=settings.adm_cookie_name,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    return {"ok": "true"}


def get_adm_user(request: Request) -> dict:
    """Dependência: sessão admin válida (cookie). Usar em rotas /adm/* protegidas."""
    require_admin_db(request)
    raw = request.cookies.get(settings.adm_cookie_name)
    if not raw:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    data = verify_session_token(raw)
    if not data:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada.")
    return data


@router.get("/me")
async def adm_me(request: Request) -> dict:
    data = get_adm_user(request)
    return {"username": data.get("sub"), "uid": data.get("uid")}
