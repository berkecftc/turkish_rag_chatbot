"""Ports: the abstraction surface between application logic and infrastructure.

Application/RAG code depends ONLY on these Protocols. Concrete adapters
(Gemini, BGE-M3, PaddleOCR, pgvector) live in app.infrastructure and are bound
via the DI container. This is the Dependency Inversion that lets us swap
providers and test without network calls.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import BinaryIO, Protocol, runtime_checkable


@dataclass(slots=True)
class TextBlock:
    text: str
    page: int | None = None
    bbox: dict | None = None
    confidence: float | None = None


@dataclass(slots=True)
class Chunk:
    content: str
    index: int
    token_count: int
    page: int | None = None
    section: str | None = None
    bbox: dict | None = None
    metadata: dict = field(default_factory=dict)


@dataclass(slots=True)
class Embedding:
    dense: list[float]
    sparse: dict[int, float] | None = None


@dataclass(slots=True)
class RetrievedChunk:
    chunk_id: str
    document_id: str
    content: str
    score: float
    page: int | None = None
    bbox: dict | None = None


@runtime_checkable
class Embedder(Protocol):
    async def embed_documents(self, texts: list[str]) -> list[Embedding]: ...
    async def embed_query(self, text: str) -> Embedding: ...


@runtime_checkable
class Reranker(Protocol):
    async def rerank(
        self, query: str, candidates: list[RetrievedChunk], top_n: int
    ) -> list[RetrievedChunk]: ...


@runtime_checkable
class LLM(Protocol):
    async def generate(self, system: str, messages: list[dict], **opts) -> str: ...
    def stream(self, system: str, messages: list[dict], **opts) -> AsyncIterator[str]: ...


@runtime_checkable
class OcrEngine(Protocol):
    async def extract(self, file_bytes: bytes, mime_type: str) -> list[TextBlock]: ...


@runtime_checkable
class Chunker(Protocol):
    def chunk(self, blocks: list[TextBlock], *, source_type: str) -> list[Chunk]: ...


@runtime_checkable
class ObjectStorage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    async def put_stream(self, key: str, fileobj: BinaryIO, content_type: str) -> None: ...
    async def get(self, key: str) -> bytes: ...
    async def presigned_put(self, key: str, expires: int) -> str: ...
