"""Ingestion persistence: chunks, jobs, failures."""
from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import delete, select

from app.infrastructure.repository import TenantScopedRepository
from app.modules.ingestion.models import Chunk, IngestionJob, JobStatus, ProcessingFailure


class ChunkRepository(TenantScopedRepository[Chunk]):
    model = Chunk

    async def delete_for_version(self, document_version_id: uuid.UUID) -> None:
        """Idempotent re-index: drop prior chunks for a version before inserting."""
        await self.session.execute(
            delete(Chunk).where(Chunk.document_version_id == document_version_id)
        )

    async def list_for_document(
        self, document_id: uuid.UUID, *, limit: int = 50, offset: int = 0
    ) -> Sequence[Chunk]:
        stmt = (
            select(Chunk)
            .where(Chunk.tenant_id == self.tenant_id, Chunk.document_id == document_id)
            .order_by(Chunk.chunk_index)
            .limit(limit)
            .offset(offset)
        )
        return (await self.session.execute(stmt)).scalars().all()


class IngestionJobRepository(TenantScopedRepository[IngestionJob]):
    model = IngestionJob

    async def latest_for_document(self, document_id: uuid.UUID) -> IngestionJob | None:
        stmt = (
            select(IngestionJob)
            .where(
                IngestionJob.tenant_id == self.tenant_id,
                IngestionJob.document_id == document_id,
            )
            .order_by(IngestionJob.created_at.desc())
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def history(
        self, *, status: JobStatus | None = None, limit: int = 50, offset: int = 0
    ) -> Sequence[IngestionJob]:
        stmt = select(IngestionJob).where(IngestionJob.tenant_id == self.tenant_id)
        if status is not None:
            stmt = stmt.where(IngestionJob.status == status)
        stmt = stmt.order_by(IngestionJob.created_at.desc()).limit(limit).offset(offset)
        return (await self.session.execute(stmt)).scalars().all()


class FailureRepository(TenantScopedRepository[ProcessingFailure]):
    model = ProcessingFailure
