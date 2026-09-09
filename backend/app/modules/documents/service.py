"""Document upload service: validate → deduplicate → store → persist → enqueue."""
from __future__ import annotations

import hashlib
import uuid
from typing import BinaryIO

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.logging import get_logger
from app.domain.ports import ObjectStorage
from app.modules.documents.models import Document, DocumentStatus, DocumentVersion
from app.modules.documents.repository import DocumentRepository, DocumentVersionRepository
from app.modules.documents.schemas import UploadResponse
from app.modules.documents.validation import MalwareScanner, NoopMalwareScanner, ValidationService
from app.modules.ingestion.models import IngestionJob, JobStatus
from app.modules.ingestion.repository import IngestionJobRepository

log = get_logger("documents")

_STORAGE_PREFIX = "documents"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _storage_key(tenant_id: uuid.UUID, doc_id: uuid.UUID, filename: str) -> str:
    return f"{_STORAGE_PREFIX}/{tenant_id}/{doc_id}/{filename}"


class DocumentUploadService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        storage: ObjectStorage,
        scanner: MalwareScanner | None = None,
    ) -> None:
        self._session = session
        self._settings = settings
        self._storage = storage
        self._validator = ValidationService(settings, scanner or NoopMalwareScanner())
        self._doc_repo: DocumentRepository | None = None
        self._ver_repo = DocumentVersionRepository(session)
        self._job_repo: IngestionJobRepository | None = None

    def _repos(self, tenant_id: uuid.UUID) -> None:
        self._doc_repo = DocumentRepository(self._session, tenant_id)
        self._job_repo = IngestionJobRepository(self._session, tenant_id)

    async def upload(
        self,
        *,
        fileobj: BinaryIO,
        filename: str,
        size_bytes: int,
        tenant_id: uuid.UUID,
        owner_id: uuid.UUID,
    ) -> UploadResponse:
        self._repos(tenant_id)

        result = await self._validator.validate(
            filename=filename, fileobj=fileobj, size_bytes=size_bytes
        )

        fileobj.seek(0)
        raw = fileobj.read()
        content_hash = _sha256(raw)
        fileobj.seek(0)

        existing = await self._doc_repo.get_by_content_hash(content_hash)
        if existing is not None:
            log.info("upload.duplicate", document_id=str(existing.id))
            latest_job = await self._job_repo.latest_for_document(existing.id)
            return UploadResponse(
                document_id=existing.id,
                job_id=latest_job.id if latest_job else None,
                status=existing.status,
                is_duplicate=True,
                version=1,
            )

        doc_id = uuid.uuid4()
        storage_key = _storage_key(tenant_id, doc_id, result.safe_filename)

        # Upload the bytes we already hold in memory. put_stream shares a
        # single BytesIO with boto3's threaded transfer, which closed the
        # buffer mid-flight ("I/O operation on closed file"); a direct
        # put_object with the raw bytes is simpler and safe for <=50MB uploads.
        await self._storage.put(storage_key, raw, result.mime_type)

        doc = Document(
            id=doc_id,
            tenant_id=tenant_id,
            owner_id=owner_id,
            title=result.safe_filename,
            source_type=result.source_type,
            status=DocumentStatus.PENDING,
            storage_key=storage_key,
            content_hash=content_hash,
            size_bytes=size_bytes,
            mime_type=result.mime_type,
            language="tr",
        )
        await self._doc_repo.add(doc)

        version = DocumentVersion(
            document_id=doc_id,
            version=1,
            storage_key=storage_key,
            content_hash=content_hash,
            size_bytes=size_bytes,
        )
        await self._ver_repo.add(version)

        job = IngestionJob(
            tenant_id=tenant_id,
            document_id=doc_id,
            status=JobStatus.QUEUED,
        )
        await self._job_repo.add(job)
        await self._session.flush()

        log.info("upload.queued", document_id=str(doc_id), job_id=str(job.id))

        self._dispatch_celery(str(doc_id), str(tenant_id), str(job.id))

        return UploadResponse(
            document_id=doc_id,
            job_id=job.id,
            status=DocumentStatus.PENDING,
            is_duplicate=False,
            version=1,
        )

    @staticmethod
    def _dispatch_celery(document_id: str, tenant_id: str, job_id: str) -> None:
        try:
            # Lazy import: keeps Celery out of the web app's import path.
            from app.workers.tasks import ingest_document

            ingest_document.apply_async(
                kwargs={"document_id": document_id, "tenant_id": tenant_id, "job_id": job_id},
                task_id=job_id,
            )
        except Exception:  # noqa: BLE001
            log.warning("celery.dispatch_failed", document_id=document_id)
