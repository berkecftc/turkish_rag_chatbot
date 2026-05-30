"""BGE reranker — implements the Reranker domain port.

Cross-encoder model that takes (query, passage) pairs and scores relevance.
Significantly more accurate than bi-encoder similarity for final ranking.
"""
from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.ports import RetrievedChunk

if TYPE_CHECKING:
    from sentence_transformers import CrossEncoder

log = get_logger("ai.reranker")
_model: "CrossEncoder | None" = None


def _load_model(model_name: str) -> "CrossEncoder":
    global _model
    if _model is None:
        from sentence_transformers import CrossEncoder

        log.info("reranker.loading", model=model_name)
        _model = CrossEncoder(model_name, max_length=512)
        log.info("reranker.ready", model=model_name)
    return _model


class BgeReranker:
    """Implements domain Reranker port using BAAI/bge-reranker-v2-m3."""

    def __init__(self) -> None:
        cfg = get_settings()
        self._model_name = cfg.reranker_model
        self._threshold = cfg.rag_rerank_threshold

    def _model(self):
        return _load_model(self._model_name)

    def _score_sync(self, query: str, passages: list[str]) -> list[float]:
        pairs = [(query, p) for p in passages]
        scores = self._model().predict(pairs, show_progress_bar=False)
        return [float(s) for s in scores]

    async def rerank(
        self, query: str, candidates: list[RetrievedChunk], top_n: int
    ) -> list[RetrievedChunk]:
        if not candidates:
            return []

        passages = [c.content for c in candidates]
        scores = await asyncio.to_thread(self._score_sync, query, passages)

        scored = sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)
        filtered = [(c, s) for c, s in scored if s >= self._threshold]

        result: list[RetrievedChunk] = []
        for chunk, score in filtered[:top_n]:
            result.append(
                RetrievedChunk(
                    chunk_id=chunk.chunk_id,
                    document_id=chunk.document_id,
                    content=chunk.content,
                    score=score,
                    page=chunk.page,
                    bbox=chunk.bbox,
                )
            )
        return result
