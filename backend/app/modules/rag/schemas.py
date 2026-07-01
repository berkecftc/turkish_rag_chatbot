"""RAG API DTOs — strict Pydantic v2 models for all request/response surfaces."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, AsyncIterator

from pydantic import BaseModel, ConfigDict, Field

from app.modules.rag.models import MessageRole


# ── Conversation ─────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    title: str | None = Field(None, max_length=512)


class ConversationUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str | None
    summary: str | None
    total_messages: int
    total_tokens_used: int
    last_message_at: datetime | None
    created_at: datetime
    updated_at: datetime


# ── Message ───────────────────────────────────────────────────────────────────

class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    role: MessageRole
    content: str
    model: str | None
    token_count: int | None
    confidence_score: float | None
    has_citations: bool
    citation_count: int
    hallucination_flags: list[str] | None
    created_at: datetime


# ── Citations ─────────────────────────────────────────────────────────────────

class CitationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    citation_number: int
    document_id: uuid.UUID | None
    document_title: str
    text_excerpt: str
    page_number: int | None
    section: str | None
    vector_score: float | None
    rerank_score: float | None
    combined_score: float | None
    source_reliability: float | None


# ── Chat Request / Response ───────────────────────────────────────────────────

class MetadataFilter(BaseModel):
    document_ids: list[uuid.UUID] | None = None
    source_types: list[str] | None = None
    language: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4096)
    conversation_id: uuid.UUID | None = None
    filters: MetadataFilter | None = None
    stream: bool = False
    debug: bool = False


class ChatResponse(BaseModel):
    conversation_id: uuid.UUID
    message_id: uuid.UUID
    content: str
    citations: list[CitationOut]
    confidence_score: float
    retrieval_quality: float | None
    hallucination_flags: list[str]
    tokens_used: int
    latency_ms: int
    model: str
    cached: bool = False


# ── Streaming SSE events ──────────────────────────────────────────────────────

class StreamDelta(BaseModel):
    type: str = "delta"
    content: str


class StreamCitation(BaseModel):
    type: str = "citation"
    citation: CitationOut


class StreamDone(BaseModel):
    type: str = "done"
    message_id: uuid.UUID
    confidence_score: float
    tokens_used: int
    latency_ms: int
    cached: bool = False
    hallucination_flags: list[str] = Field(default_factory=list)


# ── Search (retrieval-only, no generation) ────────────────────────────────────

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2048)
    filters: MetadataFilter | None = None
    top_k: int = Field(10, ge=1, le=50)
    include_scores: bool = True


class SearchResultItem(BaseModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    content: str
    page: int | None
    section: str | None
    vector_score: float | None
    bm25_score: float | None
    combined_score: float
    rerank_score: float | None
    source_reliability: float | None


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    query_intent: str
    rewritten_query: str | None
    latency_ms: int


# ── Debug ─────────────────────────────────────────────────────────────────────

class ChunkDebugInfo(BaseModel):
    chunk_id: uuid.UUID
    document_title: str
    content_preview: str
    page: int | None
    vector_score: float | None
    bm25_score: float | None
    combined_score: float
    rerank_score: float | None
    token_count: int
    included_in_context: bool


class DebugResponse(BaseModel):
    message_id: uuid.UUID
    original_query: str
    rewritten_query: str | None
    query_intent: str | None
    retrieved_chunks: list[ChunkDebugInfo]
    context_tokens: int
    was_compressed: bool
    vector_weight: float | None
    bm25_weight: float | None
    retrieval_latency_ms: int | None
    rerank_latency_ms: int | None
    generation_latency_ms: int | None
    total_latency_ms: int | None
    confidence_score: float | None
    cache_hit: bool
