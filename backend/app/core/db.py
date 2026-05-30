"""Async SQLAlchemy engine, session factory, and the declarative base.

Sessions are provided per-request via DI (see app.api.deps). The session
dependency also sets `app.tenant_id` for Postgres Row-Level Security.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import AsyncIterator

from sqlalchemy import func, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

SessionFactory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )


async def get_session(tenant_id: uuid.UUID | None = None) -> AsyncIterator[AsyncSession]:
    """Yield a session, optionally scoped to a tenant for RLS."""
    async with SessionFactory() as session:
        if tenant_id is not None:
            await session.execute(
                text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": str(tenant_id)}
            )
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
