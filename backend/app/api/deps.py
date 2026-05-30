"""FastAPI dependencies: DB session, authenticated principal, RBAC guard.

This is the composition root for request-scoped wiring (DI).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import AsyncIterator

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import context, security
from app.core.db import SessionFactory
from app.core.exceptions import AuthenticationError, AuthorizationError
from app.core.redis import redis_client

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True, slots=True)
class Principal:
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    permissions: frozenset[str]

    def has(self, permission: str) -> bool:
        return permission in self.permissions


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    """Request-scoped session. Sets RLS tenant if a principal is bound."""
    tenant_id = context.current().tenant_id
    async with SessionFactory() as session:
        if tenant_id is not None:
            from sqlalchemy import text

            await session.execute(
                text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": str(tenant_id)}
            )
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_principal(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> Principal:
    if creds is None:
        raise AuthenticationError("Missing bearer token")
    try:
        claims = security.decode_token(creds.credentials)
    except Exception as exc:  # noqa: BLE001
        raise AuthenticationError("Invalid token") from exc
    if claims.get("type") != "access":
        raise AuthenticationError("Wrong token type")
    if await redis_client.exists(f"revoked_jti:{claims['jti']}"):
        raise AuthenticationError("Token revoked")

    principal = Principal(
        user_id=uuid.UUID(claims["sub"]),
        tenant_id=uuid.UUID(claims["tid"]),
        permissions=frozenset(claims.get("perms", [])),
    )
    context.bind(context.current().request_id, principal.tenant_id, principal.user_id)
    return principal


def require(permission: str):
    """Dependency factory enforcing a permission (default-deny RBAC)."""

    async def _guard(principal: Principal = Depends(get_principal)) -> Principal:
        if not principal.has(permission):
            raise AuthorizationError(f"Missing permission: {permission}")
        return principal

    return _guard
