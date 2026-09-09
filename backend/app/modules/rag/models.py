"""RAG engine ORM models: conversations, messages, citations, retrieval logs, semantic cache."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import get_settings
from app.core.db import Base, TimestampMixin, UUIDMixin

_EMBED_DIM = get_settings().embedding_dim


class MessageRole(enum.StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class Conversation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "conversations"

    tenant_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    title: Mapped[str | None] = mapped_column(String(512))
    summary: Mapped[str | None] = mapped_column(Text)
    total_messages: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens_used: Mapped[int] = mapped_column(BigInteger, default=0)
    last_message_at: Mapped[datetime | None] = mapped_column()
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )


class Message(UUIDMixin, Base):
    __tablename__ = "messages"

    tenant_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[MessageRole] = mapped_column(
        # values_callable: serialize by enum value ("user") not name ("USER"),
        # matching the Postgres enum's lowercase labels. Without it inserts fail
        # with: invalid input value for enum message_role: "USER".
        SAEnum(
            MessageRole,
            name="message_role",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        )
    )
    content: Mapped[str] = mapped_column(Text)
    # AI-specific fields (null for user messages)
    model: Mapped[str | None] = mapped_column(String(128))
    token_count: Mapped[int | None] = mapped_column(Integer)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    confidence_score: Mapped[float | None] = mapped_column(Float)
    retrieval_quality: Mapped[float | None] = mapped_column(Float)
    has_citations: Mapped[bool] = mapped_column(Boolean, default=False)
    citation_count: Mapped[int] = mapped_column(Integer, default=0)
    hallucination_flags: Mapped[list | None] = mapped_column(JSONB)
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
    citations: Mapped[list[Citation]] = relationship(
        back_populates="message", cascade="all, delete-orphan"
    )


class Citation(UUIDMixin, Base):
    __tablename__ = "citations"

    tenant_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), index=True
    )
    chunk_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chunks.id", ondelete="SET NULL"), nullable=True
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    citation_number: Mapped[int] = mapped_column(Integer)
    document_title: Mapped[str] = mapped_column(String(512))
    text_excerpt: Mapped[str] = mapped_column(Text)
    page_number: Mapped[int | None] = mapped_column(Integer)
    section: Mapped[str | None] = mapped_column(String(512))
    vector_score: Mapped[float | None] = mapped_column(Float)
    rerank_score: Mapped[float | None] = mapped_column(Float)
    combined_score: Mapped[float | None] = mapped_column(Float)
    source_reliability: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    message: Mapped[Message] = relationship(back_populates="citations")


class RetrievalLog(UUIDMixin, Base):
    """Audit log per RAG turn — enables debugging and quality monitoring."""
    __tablename__ = "retrieval_logs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL")
    )
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL")
    )
    original_query: Mapped[str] = mapped_column(Text)
    rewritten_query: Mapped[str | None] = mapped_column(Text)
    query_intent: Mapped[str | None] = mapped_column(String(32))
    vector_results_count: Mapped[int] = mapped_column(Integer, default=0)
    bm25_results_count: Mapped[int] = mapped_column(Integer, default=0)
    reranked_results_count: Mapped[int] = mapped_column(Integer, default=0)
    final_context_chunks: Mapped[int] = mapped_column(Integer, default=0)
    context_tokens: Mapped[int] = mapped_column(Integer, default=0)
    was_compressed: Mapped[bool] = mapped_column(Boolean, default=False)
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    retrieval_latency_ms: Mapped[int | None] = mapped_column(Integer)
    rerank_latency_ms: Mapped[int | None] = mapped_column(Integer)
    generation_latency_ms: Mapped[int | None] = mapped_column(Integer)
    total_latency_ms: Mapped[int | None] = mapped_column(Integer)
    confidence_score: Mapped[float | None] = mapped_column(Float)
    vector_weight: Mapped[float | None] = mapped_column(Float)
    bm25_weight: Mapped[float | None] = mapped_column(Float)
    debug_payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)


class SemanticCache(UUIDMixin, Base):
    """Query-level semantic cache backed by pgvector similarity lookup."""
    __tablename__ = "semantic_cache"

    tenant_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    query_hash: Mapped[str] = mapped_column(String(64), index=True)  # sha256
    query_embedding: Mapped[list[float] | None] = mapped_column(Vector(_EMBED_DIM))
    original_query: Mapped[str] = mapped_column(Text)
    response_json: Mapped[dict] = mapped_column(JSONB)
    hit_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column()
