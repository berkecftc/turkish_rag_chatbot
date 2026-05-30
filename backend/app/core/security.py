"""Password hashing (Argon2id) and JWT issue/verify (RS256).

Pure functions over crypto primitives — no DB, no framework. Token revocation
(jti deny-list) lives in the auth module against Redis.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import get_settings

settings = get_settings()
_ph = PasswordHasher()  # Argon2id defaults (OWASP-aligned)


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except VerifyMismatchError:
        return False


def needs_rehash(hashed: str) -> bool:
    return _ph.check_needs_rehash(hashed)


def _encode(claims: dict[str, Any], ttl_seconds: int, token_type: str) -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    jti = str(uuid.uuid4())
    payload = {
        **claims,
        "iat": now,
        "exp": now + timedelta(seconds=ttl_seconds),
        "jti": jti,
        "type": token_type,
    }
    token = jwt.encode(payload, settings.jwt_private_key, algorithm=settings.jwt_algorithm)
    return token, jti


def create_access_token(*, user_id: uuid.UUID, tenant_id: uuid.UUID, perms: list[str]) -> str:
    token, _ = _encode(
        {"sub": str(user_id), "tid": str(tenant_id), "perms": perms},
        settings.jwt_access_ttl_seconds,
        "access",
    )
    return token


def create_refresh_token(*, user_id: uuid.UUID) -> tuple[str, str]:
    """Returns (token, jti). jti is persisted so the token can be revoked."""
    return _encode({"sub": str(user_id)}, settings.jwt_refresh_ttl_seconds, "refresh")


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_public_key, algorithms=[settings.jwt_algorithm])
