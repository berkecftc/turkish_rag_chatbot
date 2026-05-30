"""Per-request context (request_id, tenant_id, user_id) via contextvars.

Carried implicitly through the call stack so services and the logger can read
the current tenant/user without threading them through every signature.
"""
from __future__ import annotations

import uuid
from contextvars import ContextVar
from dataclasses import dataclass

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
_tenant_id: ContextVar[uuid.UUID | None] = ContextVar("tenant_id", default=None)
_user_id: ContextVar[uuid.UUID | None] = ContextVar("user_id", default=None)


@dataclass(frozen=True, slots=True)
class RequestContext:
    request_id: str
    tenant_id: uuid.UUID | None
    user_id: uuid.UUID | None


def bind(request_id: str, tenant_id: uuid.UUID | None, user_id: uuid.UUID | None) -> None:
    _request_id.set(request_id)
    _tenant_id.set(tenant_id)
    _user_id.set(user_id)


def current() -> RequestContext:
    return RequestContext(
        request_id=_request_id.get() or "no-request",
        tenant_id=_tenant_id.get(),
        user_id=_user_id.get(),
    )


def require_tenant() -> uuid.UUID:
    tenant = _tenant_id.get()
    if tenant is None:
        raise RuntimeError("No tenant bound to request context")
    return tenant
