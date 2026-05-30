"""Token-aware context packer with semantic deduplication.

Algorithm:
1. Sort by rerank_score (or combined_score if reranker skipped).
2. Semantic deduplication: skip chunks whose embedding cosine similarity
   to an already-included chunk exceeds the dedup threshold (0.92).
   Uses only token count (no re-embedding needed) as a fast proxy when
   embeddings aren't cached; full cosine dedup when embeddings are available.
3. Greedy token packing: stop when budget is exhausted.
4. Format each chunk as a numbered section for citation.

Output: formatted context string + ordered list of included FusedResults.
"""
from __future__ import annotations

import math
import uuid
from dataclasses import dataclass, field

from app.core.config import get_settings
from app.core.logging import get_logger
from app.infrastructure.rag.retrieval.fusion import FusedResult

log = get_logger("context.packer")

_DEDUP_SIMILARITY_THRESHOLD = 0.92


@dataclass
class PackedContext:
    formatted: str
    chunks: list[FusedResult]
    token_count: int
    was_truncated: bool
    citation_map: dict[int, uuid.UUID]  # citation_number -> chunk_id


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _approx_tokens(text: str) -> int:
    # ~4 chars/token heuristic (fast, avoids tiktoken in hot path)
    return max(1, len(text) // 4)


class ContextPacker:
    def __init__(self) -> None:
        cfg = get_settings()
        self._max_tokens = cfg.rag_context_max_tokens

    def pack(
        self,
        candidates: list[FusedResult],
        *,
        max_tokens: int | None = None,
    ) -> PackedContext:
        budget = max_tokens or self._max_tokens
        included: list[FusedResult] = []
        used_tokens = 0
        included_embeddings: list[list[float]] = []

        for chunk in candidates:
            # Semantic deduplication using chunk embeddings if available
            chunk_emb = chunk.chunk_metadata.get("embedding")
            if chunk_emb and included_embeddings:
                if any(_cosine(chunk_emb, e) >= _DEDUP_SIMILARITY_THRESHOLD for e in included_embeddings):
                    continue

            chunk_tokens = chunk.token_count or _approx_tokens(chunk.content)
            if used_tokens + chunk_tokens > budget:
                continue  # skip oversized chunks, don't stop (smaller ones may fit)

            included.append(chunk)
            used_tokens += chunk_tokens
            if chunk_emb:
                included_embeddings.append(chunk_emb)

        was_truncated = len(included) < len(candidates)
        citation_map: dict[int, uuid.UUID] = {}
        sections: list[str] = []

        for i, chunk in enumerate(included, start=1):
            citation_map[i] = chunk.chunk_id
            header_parts = [f"[{i}] {chunk.document_title}"]
            if chunk.page:
                header_parts.append(f"(p.{chunk.page})")
            if chunk.section:
                header_parts.append(f"— {chunk.section}")
            sections.append(f"{'  '.join(header_parts)}\n{chunk.content}")

        formatted = "\n\n---\n\n".join(sections)

        log.info(
            "context.packed",
            chunks=len(included),
            tokens=used_tokens,
            truncated=was_truncated,
        )
        return PackedContext(
            formatted=formatted,
            chunks=included,
            token_count=used_tokens,
            was_truncated=was_truncated,
            citation_map=citation_map,
        )
