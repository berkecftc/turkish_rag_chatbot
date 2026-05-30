"""Generic async repository (Repository pattern).

Encapsulates persistence so services depend on a narrow CRUD surface, not on
SQLAlchemy. Tenant-scoped subclasses add automatic `tenant_id` filtering as a
defense-in-depth complement to Postgres RLS.
"""
from __future__ import annotations

import uuid
from typing import Generic, Sequence, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    model: type[ModelT]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, id_: uuid.UUID) -> ModelT | None:
        return await self.session.get(self.model, id_)

    async def list(self, *, limit: int = 50, offset: int = 0) -> Sequence[ModelT]:
        stmt = select(self.model).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def add(self, entity: ModelT) -> ModelT:
        self.session.add(entity)
        await self.session.flush()
        return entity

    async def delete(self, entity: ModelT) -> None:
        await self.session.delete(entity)


class TenantScopedRepository(BaseRepository[ModelT]):
    """Auto-injects the current tenant filter on reads."""

    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID) -> None:
        super().__init__(session)
        self.tenant_id = tenant_id

    async def list(self, *, limit: int = 50, offset: int = 0) -> Sequence[ModelT]:
        stmt = (
            select(self.model)
            .where(self.model.tenant_id == self.tenant_id)  # type: ignore[attr-defined]
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()
