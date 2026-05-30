"""Authentication use-cases. Framework-free: raises domain errors, returns DTOs.

Scope: credential verification + JWT issue/refresh/revoke. Tenant onboarding
(creating a tenant + owner membership on signup) is a cross-module orchestration
and lives in a dedicated onboarding use-case (see ROADMAP, Phase 2), keeping
this module within its boundary.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.core import security
from app.core.config import get_settings
from app.core.exceptions import AuthenticationError
from app.core.redis import redis_client
from app.modules.auth.models import RefreshToken
from app.modules.auth.repository import RefreshTokenRepository, UserRepository
from app.modules.auth.schemas import TokenPair

settings = get_settings()
_REVOKED_PREFIX = "revoked_jti:"


class AuthService:
    def __init__(self, users: UserRepository, tokens: RefreshTokenRepository) -> None:
        self._users = users
        self._tokens = tokens

    async def authenticate(self, email: str, password: str) -> TokenPair:
        user = await self._users.get_by_email(email)
        # Constant-ish path: verify even on missing user to limit timing leaks.
        if user is None or not security.verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid credentials")
        if not user.is_active:
            raise AuthenticationError("Account disabled")

        membership = await self._users.membership_for(user.id)
        if membership is None:
            raise AuthenticationError("User has no tenant membership")

        perms = [p.code for p in membership.role.permissions]
        user.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
        return await self._issue(user.id, membership.tenant_id, perms)

    async def refresh(self, refresh_token: str) -> TokenPair:
        try:
            claims = security.decode_token(refresh_token)
        except Exception as exc:  # noqa: BLE001 - normalize to domain error
            raise AuthenticationError("Invalid refresh token") from exc
        if claims.get("type") != "refresh":
            raise AuthenticationError("Wrong token type")

        jti = uuid.UUID(claims["jti"])
        if await redis_client.exists(f"{_REVOKED_PREFIX}{jti}"):
            raise AuthenticationError("Token revoked")

        stored = await self._tokens.get_by_jti(jti)
        if stored is None or stored.revoked_at is not None:
            raise AuthenticationError("Token revoked")

        user_id = uuid.UUID(claims["sub"])
        membership = await self._users.membership_for(user_id)
        if membership is None:
            raise AuthenticationError("User has no tenant membership")
        perms = [p.code for p in membership.role.permissions]

        await self._revoke(stored)  # rotation: old refresh dies on use
        return await self._issue(user_id, membership.tenant_id, perms)

    async def _issue(
        self, user_id: uuid.UUID, tenant_id: uuid.UUID, perms: list[str]
    ) -> TokenPair:
        access = security.create_access_token(
            user_id=user_id, tenant_id=tenant_id, perms=perms
        )
        refresh, jti = security.create_refresh_token(user_id=user_id)
        await self._tokens.add(
            RefreshToken(
                user_id=user_id,
                jti=uuid.UUID(jti),
                expires_at=datetime.fromtimestamp(
                    security.decode_token(refresh)["exp"], tz=timezone.utc
                ).replace(tzinfo=None),
            )
        )
        return TokenPair(access_token=access, refresh_token=refresh)

    async def _revoke(self, token: RefreshToken) -> None:
        token.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
        now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
        ttl = int((token.expires_at - now_naive).total_seconds())
        if ttl > 0:
            await redis_client.setex(f"{_REVOKED_PREFIX}{token.jti}", ttl, "1")
