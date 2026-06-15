"""Celery task entrypoints. Loads bytes from storage, builds the pipeline,
runs it, persists chunks + embeddings, updates document/job status."""
from __future__ import annotations

import asyncio
import traceback
import uuid
from datetime import datetime, timezone

from app.core.logging import get_logger
from app.workers.celery_app import celery

log = get_logger("ingestion")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _build_pipeline(mime_type: str):
    from app.infrastructure.ingestion.chunking.token_chunker import TokenChunkerStage
    from app.infrastructure.ingestion.embedding.bge_embedder import BgeEmbedderStage
    from app.infrastructure.ingestion.normalization.turkish_normalizer import TurkishNormalizerStage
    from app.infrastructure.ingestion.ocr.paddle_ocr import PaddleOcrStage
    from app.workers.pipeline import Pipeline

    if mime_type == "application/pdf":
        from app.infrastructure.ingestion.extractors.pdf_extractor import PdfExtractorStage
        extractor = PdfExtractorStage()
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        from app.infrastructure.ingestion.extractors.docx_extractor import DocxExtractorStage
        extractor = DocxExtractorStage()
    elif mime_type in ("text/csv", "application/csv"):
        from app.infrastructure.ingestion.extractors.csv_extractor import CsvExtractorStage
        extractor = CsvExtractorStage()
    else:
        from app.infrastructure.ingestion.extractors.pdf_extractor import PdfExtractorStage
        extractor = PdfExtractorStage()

    return Pipeline([
        extractor,
        PaddleOcrStage(),
        TurkishNormalizerStage(),
        TokenChunkerStage(),
        BgeEmbedderStage(),
    ])


async def _run_pipeline(document_id: str, tenant_id: str, job_id: str) -> None:
    from sqlalchemy import text

    from app.core.config import get_settings
    from app.core.db import SessionFactory
    from app.infrastructure.ingestion.storage.minio_storage import MinioStorage
    from app.modules.documents.models import DocumentStatus
    from app.modules.documents.repository import DocumentRepository
    from app.modules.ingestion.models import IngestionJob, IngestionStage, JobStatus
    from app.modules.ingestion.repository import ChunkRepository, FailureRepository, IngestionJobRepository
    from app.workers.pipeline import IngestionContext

    settings = get_settings()
    storage = MinioStorage(settings)
    doc_uuid = uuid.UUID(document_id)
    tenant_uuid = uuid.UUID(tenant_id)
    job_uuid = uuid.UUID(job_id)

    async with SessionFactory() as session:
        await session.execute(text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": tenant_id})

        doc_repo = DocumentRepository(session, tenant_uuid)
        job_repo = IngestionJobRepository(session, tenant_uuid)
        chunk_repo = ChunkRepository(session, tenant_uuid)

        doc = await doc_repo.get(doc_uuid)
        job = await job_repo.get(job_uuid)
        if doc is None or job is None:
            log.error("ingest.missing_record", document_id=document_id, job_id=job_id)
            return

        # Mark running
        job.status = JobStatus.RUNNING
        job.stage = IngestionStage.EXTRACT
        job.started_at = _now()
        job.attempts += 1
        doc.status = DocumentStatus.PROCESSING
        await session.flush()

        try:
            file_bytes = await storage.get(doc.storage_key)
            ctx = IngestionContext(
                document_id=document_id,
                tenant_id=tenant_id,
                file_bytes=file_bytes,
                mime_type=doc.mime_type,
            )

            pipeline = _build_pipeline(doc.mime_type)
            ctx = await pipeline.run(ctx)

            # Persist chunks
            from app.modules.ingestion.models import Chunk as ChunkModel, EmbeddingStatus

            # Delete existing chunks for idempotency
            from sqlalchemy import delete
            await session.execute(
                delete(ChunkModel).where(
                    ChunkModel.document_id == doc_uuid,
                    ChunkModel.tenant_id == tenant_uuid,
                )
            )

            for chunk in ctx.chunks:
                embedding = chunk.metadata.get("embedding")
                orm_chunk = ChunkModel(
                    tenant_id=tenant_uuid,
                    document_id=doc_uuid,
                    chunk_index=chunk.index,
                    content=chunk.content,
                    token_count=chunk.token_count,
                    page=chunk.page,
                    section=chunk.section,
                    char_start=chunk.metadata.get("char_start"),
                    char_end=chunk.metadata.get("char_end"),
                    chunk_strategy=chunk.metadata.get("strategy", "token_sliding"),
                    embedding=embedding,
                    embedding_status=EmbeddingStatus.EMBEDDED if embedding else EmbeddingStatus.PENDING,
                )
                session.add(orm_chunk)

            # Update doc metadata
            if ctx.metadata.get("page_count") is not None:
                doc.page_count = ctx.metadata["page_count"]
            doc.status = DocumentStatus.READY

            job.status = JobStatus.SUCCEEDED
            job.stage = IngestionStage.DONE
            job.progress = 100
            job.finished_at = _now()

            await session.commit()
            log.info("ingest.done", document_id=document_id, chunks=len(ctx.chunks))

        except Exception as exc:
            tb = traceback.format_exc()
            log.error("ingest.failed", document_id=document_id, error=str(exc))

            await session.rollback()

            async with SessionFactory() as err_session:
                await err_session.execute(text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": tenant_id})
                err_job_repo = IngestionJobRepository(err_session, tenant_uuid)
                err_doc_repo = DocumentRepository(err_session, tenant_uuid)
                fail_repo = FailureRepository(err_session, tenant_uuid)

                err_job = await err_job_repo.get(job_uuid)
                err_doc = await err_doc_repo.get(doc_uuid)

                if err_job:
                    is_terminal = err_job.attempts >= err_job.max_attempts
                    err_job.status = JobStatus.DEAD if is_terminal else JobStatus.FAILED
                    err_job.stage = IngestionStage.ERROR
                    err_job.error = str(exc)[:2000]
                    err_job.finished_at = _now()

                if err_doc:
                    err_doc.status = DocumentStatus.FAILED
                    err_doc.error = str(exc)[:2000]

                from app.modules.ingestion.models import ProcessingFailure

                fail = ProcessingFailure(
                    tenant_id=tenant_uuid,
                    job_id=job_uuid,
                    document_id=doc_uuid,
                    stage=IngestionStage.ERROR,
                    category="pipeline",
                    error_type=type(exc).__name__,
                    message=str(exc)[:2000],
                    traceback=tb[:8000],
                    attempt=err_job.attempts if err_job else 1,
                    is_terminal=err_job.attempts >= err_job.max_attempts if err_job else True,
                )
                err_session.add(fail)
                await err_session.commit()

            raise


@celery.task(
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
    retry_backoff=True,
    acks_late=True,
)
def ingest_document(self, document_id: str, tenant_id: str, job_id: str) -> dict:
    """Run the full ingestion pipeline for one document."""
    log.info("ingest.start", document_id=document_id, attempt=self.request.retries)
    asyncio.run(_run_and_cleanup(document_id, tenant_id, job_id))
    return {"document_id": document_id, "status": "done"}


async def _run_and_cleanup(document_id: str, tenant_id: str, job_id: str) -> None:
    """Run the pipeline, then dispose the async engine within this loop.

    Celery runs each task via a fresh ``asyncio.run`` loop, but the module-level
    async engine pools connections bound to the loop that first used them. Without
    disposing here, the *next* task's new loop inherits a connection bound to the
    previous (closed) loop -> "got Future attached to a different loop". Disposing
    inside the same loop releases those connections so each task starts clean.
    """
    from app.core.db import engine

    try:
        await _run_pipeline(document_id, tenant_id, job_id)
    finally:
        await engine.dispose()
