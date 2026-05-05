from __future__ import annotations

from typing import Any

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.settings import settings

_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7  # 7 days


def create_session_token(user_id: int, username: str) -> str:
    ser = URLSafeTimedSerializer(settings.secret_key)
    return ser.dumps({"uid": user_id, "sub": username})


def verify_session_token(token: str) -> dict[str, Any] | None:
    ser = URLSafeTimedSerializer(settings.secret_key)
    try:
        return ser.loads(token, max_age=_SESSION_MAX_AGE_SEC)
    except (BadSignature, SignatureExpired):
        return None
