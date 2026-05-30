"""Ingestion ORM models + enums: chunks, jobs, failures."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import get_settings
from app.core.db import Base, UUIDMixin

_EMBED_DIM = get_settings().embedding_dim


class JobStatus(enum.StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    RETRYING = "retrying"
    DEAD = "dead"


class IngestionStage(enum.StrEnum):
    QUEUED = "queued"
    EXTRACT = "extract"
    OCR = "ocr"
    CHUNK = "chunk"
    EMBED = "embed"
    INDEX = "index"
    DONE = "done"
    ERROR = "error"


class EmbeddingStatus(enum.StrEnum):
    PENDING = "pending"
    EMBEDDED = "embedded"
    FAILED = "failed"


class Chunk(UUIDMixin, Base):
    __tablename__ = "chunks"
    __table_args__ = (UniqueConstraint("document_id", "chunk_index", name="uq_chunk_doc_index"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    document_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("document_versions.id", ondelete="SET NULL")
    )
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    token_count: Mapped[int] = mapped_column(Integer)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(_EMBED_DIM))
    content_tsv: Mapped[str | None] = mapped_column(TSVECTOR)
    # lineage
    page: Mapped[int | None] = mapped_column(Integer)
    section: Mapped[str | None] = mapped_column(String(512))
    bbox: Mapped[dict | None] = mapped_column(JSONB)
    char_start: Mapped[int | None] = mapped_column(Integer)
    char_end: Mapped[int | None] = mapped_column(Integer)
    chunk_strategy: Mapped[str | None] = mapped_column(String(32))
    embedding_status: Mapped[EmbeddingStatus] = mapped_column(
        SAEnum(EmbeddingStatus, name="embedding_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=EmbeddingStatus.PENDING,
    )
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    ingested_at: Mapped[datetime] = mapped_column(server_default=func.now())


class IngestionJob(UUIDMixin, Base):
    __tablename__ = "ingestion_jobs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[JobStatus] = mapped_column(
        SAEnum(JobStatus, name="job_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=JobStatus.QUEUED,
        index=True,
    )
    stage: Mapped[IngestionStage] = mapped_column(
        SAEnum(IngestionStage, name="ingestion_stage", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=IngestionStage.QUEUED,
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    error: Mapped[str | None] = mapped_column(Text)
    celery_task_id: Mapped[str | None] = mapped_column(String(255))
    started_at: Mapped[datetime | None] = mapped_column()
    finished_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ProcessingFailure(UUIDMixin, Base):
    __tablename__ = "processing_failures"

    tenant_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ingestion_jobs.id", ondelete="CASCADE"))
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    stage: Mapped[IngestionStage] = mapped_column(
        SAEnum(IngestionStage, name="ingestion_stage", native_enum=True, create_type=False, values_callable=lambda x: [e.value for e in x])
    )
    category: Mapped[str] = mapped_column(String(32))
    error_type: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    traceback: Mapped[str | None] = mapped_column(Text)
    attempt: Mapped[int] = mapped_column(Integer)
    is_terminal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
