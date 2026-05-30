"""Cross-cutting HTTP middleware: request-id binding + sliding-window rate limit."""
from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core import context
from app.core.config import get_settings
from app.core.redis import redis_client

settings = get_settings()


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        context.bind(request_id, None, None)
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Fixed-window counter in Redis keyed by client identity + path class."""

    async def dispatch(self, request: Request, call_next) -> Response:
        identity = request.client.host if request.client else "anon"
        is_rag = request.url.path.endswith(("/chat", "/query"))
        limit = settings.rate_limit_rag_per_minute if is_rag else settings.rate_limit_per_minute
        window = int(time.time() // 60)
        key = f"rl:{identity}:{'rag' if is_rag else 'std'}:{window}"

        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, 60)
        if count > limit:
            return JSONResponse(
                status_code=429,
                content={"title": "rate_limited", "status": 429, "detail": "Too many requests"},
                media_type="application/problem+json",
            )
        return await call_next(request)
