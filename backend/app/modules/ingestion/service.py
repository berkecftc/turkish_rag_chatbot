"""Ingestion orchestration service.

Canonical interface for managing ingestion job lifecycle:
  - create_and_dispatch: create an IngestionJob and immediately enqueue it
  - retry: reset a failed/dead job and re-enqueue it
  - get_latest_for_document: query the most recent job for a document

DocumentUploadService (documents/service.py) owns the initial upload flow
and calls Celery directly.  This service provides the same dispatch logic
as a reusable unit for re-ingestion triggers, admin tooling, and tests.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.modules.ingestion.models import IngestionJob, IngestionStage, JobStatus
from app.modules.ingestion.repository import IngestionJobRepository

log = get_logger("ingestion.service")


class IngestionService:
    """Manages ingestion job creation, dispatch, and retry."""

    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID) -> None:
        self._session = session
        self._tenant_id = tenant_id
        self._repo = IngestionJobRepository(session, tenant_id)

    async def create_and_dispatch(self, document_id: uuid.UUID) -> IngestionJob:
        """Create a new QUEUED job for an existing document and dispatch the Celery task."""
        job = IngestionJob(
            tenant_id=self._tenant_id,
            document_id=document_id,
            status=JobStatus.QUEUED,
            stage=IngestionStage.QUEUED,
        )
        self._session.add(job)
        await self._session.flush()

        self._enqueue(str(document_id), str(self._tenant_id), str(job.id))
        log.info("ingestion.dispatched", document_id=str(document_id), job_id=str(job.id))
        return job

    async def retry(self, job_id: uuid.UUID) -> IngestionJob:
        """Reset a FAILED or DEAD job to QUEUED and re-dispatch it.

        Raises NotFoundError if the job does not belong to this tenant.
        Returns the job unchanged if it is not in a retryable state.
        """
        job = await self._repo.get(job_id)
        if job is None or job.tenant_id != self._tenant_id:
            raise NotFoundError(f"Job {job_id} not found")

        if job.status not in (JobStatus.FAILED, JobStatus.DEAD):
            log.warning(
                "ingestion.retry_skipped_non_terminal",
                job_id=str(job_id),
                status=job.status,
            )
            return job

        job.status = JobStatus.QUEUED
        job.stage = IngestionStage.QUEUED
        job.error = None
        job.progress = 0
        await self._session.flush()

        self._enqueue(str(job.document_id), str(self._tenant_id), str(job.id))
        log.info("ingestion.retried", job_id=str(job_id))
        return job

    async def get_latest_for_document(self, document_id: uuid.UUID) -> IngestionJob | None:
        """Return the most recent ingestion job for a document, or None."""
        return await self._repo.latest_for_document(document_id)

    @staticmethod
    def _enqueue(document_id: str, tenant_id: str, job_id: str) -> None:
        """Dispatch the Celery ingestion task. Swallows broker errors gracefully."""
        try:
            from app.workers.tasks import ingest_document  # lazy — avoids Celery at import time

            ingest_document.apply_async(
                kwargs={"document_id": document_id, "tenant_id": tenant_id, "job_id": job_id},
                task_id=job_id,
            )
        except Exception:
            log.warning("ingestion.enqueue_failed", job_id=job_id)
