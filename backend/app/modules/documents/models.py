"""Document lifecycle ORM models + enums."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, UUIDMixin


class DocumentSource(enum.StrEnum):
    PDF = "pdf"
    DOCX = "docx"
    XLSX = "xlsx"
    CSV = "csv"
    IMAGE = "image"
    TXT = "txt"


class DocumentStatus(enum.StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"
    QUARANTINED = "quarantined"


class Document(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "documents"
    # Partial unique index: a content hash is unique only among *active* docs.
    # A full UniqueConstraint also counts soft-deleted rows, so re-uploading a
    # previously deleted document collided (IntegrityError -> 500).
    __table_args__ = (
        Index(
            "uq_documents_tenant_hash",
            "tenant_id",
            "content_hash",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True))
    title: Mapped[str] = mapped_column(String(512))
    source_type: Mapped[DocumentSource] = mapped_column(
        SAEnum(
            DocumentSource,
            name="document_source",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        )
    )
    status: Mapped[DocumentStatus] = mapped_column(
        SAEnum(
            DocumentStatus,
            name="document_status",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        default=DocumentStatus.PENDING,
        index=True,
    )
    storage_key: Mapped[str] = mapped_column(String(1024))
    content_hash: Mapped[str] = mapped_column(String(64), index=True)  # sha256 hex
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    mime_type: Mapped[str] = mapped_column(String(255))
    page_count: Mapped[int | None] = mapped_column(Integer)
    language: Mapped[str] = mapped_column(String(8), default="tr")
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    deleted_at: Mapped[datetime | None] = mapped_column()

    versions: Mapped[list[DocumentVersion]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class DocumentVersion(UUIDMixin, Base):
    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "version", name="uq_version_doc_version"),)

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(1024))
    content_hash: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    document: Mapped[Document] = relationship(back_populates="versions")
