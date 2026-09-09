"""RAG observability — structured logging and metrics for each pipeline turn.

Each RAG turn emits a RetrievalLog record to PostgreSQL and structured log
events with latency breakdowns. Prometheus metrics are exposed via the
existing /metrics endpoint (via prometheus-fastapi-instrumentator).

Tracked metrics:
- rag_retrieval_latency_ms   (histogram)
- rag_rerank_latency_ms      (histogram)
- rag_generation_latency_ms  (histogram)
- rag_total_latency_ms       (histogram)
- rag_cache_hits_total       (counter)
- rag_confidence_score       (histogram)
- rag_hallucination_flags    (histogram)
- rag_context_tokens         (histogram)
"""
from __future__ import annotations

import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from app.core.logging import get_logger

log = get_logger("observability.tracker")

try:
    from prometheus_client import Counter, Histogram

    _cache_hits = Counter("rag_cache_hits_total", "Semantic cache hits", ["tenant"])
    _retrieval_latency = Histogram("rag_retrieval_latency_ms", "Retrieval latency (ms)")
    _rerank_latency = Histogram("rag_rerank_latency_ms", "Reranker latency (ms)")
    _generation_latency = Histogram("rag_generation_latency_ms", "Generation latency (ms)")
    _total_latency = Histogram("rag_total_latency_ms", "Total RAG latency (ms)")
    _confidence = Histogram(
        "rag_confidence_score",
        "Confidence score distribution",
        buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    )
    _context_tokens = Histogram(
        "rag_context_tokens",
        "Context token count",
        buckets=[500, 1000, 2000, 4000, 8000, 12000, 16000],
    )
    _PROMETHEUS = True
except ImportError:
    _PROMETHEUS = False


@dataclass
class TurnMetrics:
    tenant_id: uuid.UUID
    conversation_id: uuid.UUID | None = None
    message_id: uuid.UUID | None = None
    original_query: str = ""
    rewritten_query: str | None = None
    query_intent: str | None = None
    vector_results: int = 0
    bm25_results: int = 0
    reranked_results: int = 0
    context_chunks: int = 0
    context_tokens: int = 0
    was_compressed: bool = False
    cache_hit: bool = False
    confidence: float = 0.0
    hallucination_flags: list[str] = field(default_factory=list)
    vector_weight: float | None = None
    bm25_weight: float | None = None
    retrieval_ms: int = 0
    rerank_ms: int = 0
    generation_ms: int = 0
    total_ms: int = 0
    debug_payload: dict = field(default_factory=dict)


class RetrievalTracker:
    """Thread-safe per-turn metrics collector."""

    def __init__(self) -> None:
        self._start: float = 0.0
        self._stage_start: float = 0.0
        self.metrics = TurnMetrics(tenant_id=uuid.UUID(int=0))

    def start(self, tenant_id: uuid.UUID, query: str) -> None:
        self._start = time.monotonic()
        self.metrics = TurnMetrics(tenant_id=tenant_id, original_query=query)

    @asynccontextmanager
    async def measure(self, stage: str) -> AsyncIterator[None]:
        t0 = time.monotonic()
        try:
            yield
        finally:
            elapsed = int((time.monotonic() - t0) * 1000)
            if stage == "retrieval":
                self.metrics.retrieval_ms = elapsed
            elif stage == "rerank":
                self.metrics.rerank_ms = elapsed
            elif stage == "generation":
                self.metrics.generation_ms = elapsed

    def finish(self) -> None:
        self.metrics.total_ms = int((time.monotonic() - self._start) * 1000)
        self._emit()

    def _emit(self) -> None:
        m = self.metrics
        log.info(
            "rag.turn",
            tenant=str(m.tenant_id),
            intent=m.query_intent,
            cache_hit=m.cache_hit,
            vector=m.vector_results,
            bm25=m.bm25_results,
            reranked=m.reranked_results,
            context_chunks=m.context_chunks,
            context_tokens=m.context_tokens,
            confidence=m.confidence,
            flags=len(m.hallucination_flags),
            retrieval_ms=m.retrieval_ms,
            rerank_ms=m.rerank_ms,
            generation_ms=m.generation_ms,
            total_ms=m.total_ms,
        )

        if not _PROMETHEUS:
            return

        tenant = str(m.tenant_id)
        if m.cache_hit:
            _cache_hits.labels(tenant=tenant).inc()
        _retrieval_latency.observe(m.retrieval_ms)
        _rerank_latency.observe(m.rerank_ms)
        _generation_latency.observe(m.generation_ms)
        _total_latency.observe(m.total_ms)
        _confidence.observe(m.confidence)
        _context_tokens.observe(m.context_tokens)
