"""Document API DTOs (boundary, separate from ORM)."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.documents.models import DocumentSource, DocumentStatus


class UploadResponse(BaseModel):
    document_id: uuid.UUID
    job_id: uuid.UUID | None
    status: DocumentStatus
    is_duplicate: bool = False
    version: int


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    source_type: DocumentSource
    status: DocumentStatus
    mime_type: str
    size_bytes: int
    page_count: int | None
    language: str
    created_at: datetime


class DocumentVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    version: int
    content_hash: str
    size_bytes: int
    created_at: datetime
