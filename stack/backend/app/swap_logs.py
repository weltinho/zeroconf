from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SwapOrderLog


async def log_swap_step(
    session: AsyncSession,
    order_id: int,
    stage: str,
    message: str | None = None,
    details: dict[str, Any] | None = None,
    auxiliary_info: str | None = None,
) -> None:
    details_json = None
    if details is not None:
        try:
            details_json = json.dumps(details, ensure_ascii=True, separators=(",", ":"))
        except Exception:
            details_json = json.dumps({"details_unserializable": True}, ensure_ascii=True)
    session.add(
        SwapOrderLog(
            order_id=order_id,
            stage=stage[:96],
            message=message,
            details_json=details_json,
            auxiliary_info=auxiliary_info,
        )
    )
