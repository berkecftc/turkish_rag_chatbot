"""Liveness and readiness probes."""
from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.core.db import engine
from app.core.redis import redis_client

router = APIRouter(tags=["health"])


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def ready() -> dict[str, object]:
    checks: dict[str, bool] = {}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["postgres"] = True
    except Exception:
        checks["postgres"] = False
    try:
        await redis_client.ping()
        checks["redis"] = True
    except Exception:
        checks["redis"] = False

    return {"status": "ok" if all(checks.values()) else "degraded", "checks": checks}
