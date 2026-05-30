"""Ingestion API DTOs."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.ingestion.models import EmbeddingStatus, IngestionStage, JobStatus


class JobStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    document_id: uuid.UUID
    status: JobStatus
    stage: IngestionStage
    progress: int
    attempts: int
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class ChunkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    chunk_index: int
    content: str
    token_count: int
    page: int | None
    section: str | None
    char_start: int | None
    char_end: int | None
    chunk_strategy: str | None
    embedding_status: EmbeddingStatus
