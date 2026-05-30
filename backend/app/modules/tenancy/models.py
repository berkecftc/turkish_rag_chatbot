"""Tenancy ORM models."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, UUIDMixin


class Tenant(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    plan: Mapped[str] = mapped_column(String(50), default="free")
    quota_docs: Mapped[int] = mapped_column(BigInteger, default=1000)
    quota_tokens: Mapped[int] = mapped_column(BigInteger, default=1_000_000)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    deleted_at: Mapped[datetime | None] = mapped_column()
