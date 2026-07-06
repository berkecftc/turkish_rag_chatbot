"""Ingestion HTTP interface: job status, chunk listing, manual retry."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, get_principal
from app.core.exceptions import NotFoundError
from app.modules.ingestion.models import JobStatus
from app.modules.ingestion.repository import ChunkRepository, IngestionJobRepository
from app.modules.ingestion.schemas import ChunkOut, JobStatusOut

router = APIRouter(prefix="/ingestion", tags=["ingestion"])


@router.get("/jobs", response_model=list[JobStatusOut])
async def list_jobs(
    job_status: JobStatus | None = None,
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> list[JobStatusOut]:
    repo = IngestionJobRepository(session, principal.tenant_id)
    jobs = await repo.history(
        principal.user_id, status=job_status, limit=limit, offset=offset
    )
    return [JobStatusOut.model_validate(j) for j in jobs]


@router.get("/jobs/{job_id}", response_model=JobStatusOut)
async def get_job(
    job_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> JobStatusOut:
    repo = IngestionJobRepository(session, principal.tenant_id)
    job = await repo.get(job_id)
    if job is None or job.tenant_id != principal.tenant_id:
        raise NotFoundError(f"Job {job_id} not found")
    if await repo.document_owner(job.document_id) != principal.user_id:
        raise NotFoundError(f"Job {job_id} not found")
    return JobStatusOut.model_validate(job)


@router.get("/documents/{document_id}/chunks", response_model=list[ChunkOut])
async def list_chunks(
    document_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> list[ChunkOut]:
    job_repo = IngestionJobRepository(session, principal.tenant_id)
    if await job_repo.document_owner(document_id) != principal.user_id:
        raise NotFoundError(f"Document {document_id} not found")
    repo = ChunkRepository(session, principal.tenant_id)
    chunks = await repo.list_for_document(document_id, limit=limit, offset=offset)
    return [ChunkOut.model_validate(c) for c in chunks]


@router.post("/jobs/{job_id}/retry", response_model=JobStatusOut, status_code=status.HTTP_202_ACCEPTED)
async def retry_job(
    job_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> JobStatusOut:
    repo = IngestionJobRepository(session, principal.tenant_id)
    job = await repo.get(job_id)
    if job is None or job.tenant_id != principal.tenant_id:
        raise NotFoundError(f"Job {job_id} not found")
    if await repo.document_owner(job.document_id) != principal.user_id:
        raise NotFoundError(f"Job {job_id} not found")

    job.status = JobStatus.QUEUED
    job.error = None
    await session.flush()

    try:
        from app.workers.tasks import ingest_document

        ingest_document.apply_async(
            kwargs={"document_id": str(job.document_id), "tenant_id": str(job.tenant_id), "job_id": str(job_id)},
            task_id=str(job_id),
        )
    except Exception:  # noqa: BLE001
        pass

    return JobStatusOut.model_validate(job)
