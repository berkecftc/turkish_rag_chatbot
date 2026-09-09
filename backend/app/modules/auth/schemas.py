"""Auth API DTOs (request/response boundary). Strict validation at the edge."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str | None = Field(default=None, max_length=200)
    tenant_name: str = Field(min_length=2, max_length=120)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refresh_token: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    is_active: bool


class MeOut(BaseModel):
    """Current-user identity for the UI (GET /auth/me)."""
    user_id: uuid.UUID
    email: EmailStr
    full_name: str | None
    role: str
    tenant_id: uuid.UUID
    tenant_name: str
    tenant_slug: str
