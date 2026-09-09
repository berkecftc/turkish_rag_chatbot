"""BGE cross-encoder reranking engine.

Cross-encoders jointly encode (query, passage) pairs — far more accurate than
bi-encoder similarity for final precision ranking, but more expensive:
  O(n) forward passes vs a single bi-encoder query embed.

Optimization strategies:
1. Only rerank the top-K candidates from hybrid retrieval (default: 50→8).
2. Lazy model load — model is loaded once and cached in process memory.
3. Run in a thread pool to keep the async event loop free.
4. Score threshold filtering removes clearly irrelevant results.

Scoring: BGE reranker returns logits; we apply sigmoid for [0,1] confidence.
"""
from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass

from app.core.config import get_settings
from app.core.logging import get_logger
from app.infrastructure.rag.retrieval.fusion import FusedResult

log = get_logger("reranking.bge")

_model = None


def _load_model(name: str):
    global _model
    if _model is None:
        from sentence_transformers import CrossEncoder

        log.info("reranker.loading", model=name)
        _model = CrossEncoder(name, max_length=512)
        log.info("reranker.ready", model=name)
    return _model


@dataclass
class RankedResult:
    result: FusedResult
    rerank_score: float

    def __post_init__(self):
        self.result.rerank_score = self.rerank_score


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


class BgeRerankerEngine:
    def __init__(self) -> None:
        cfg = get_settings()
        self._model_name = cfg.reranker_model
        self._top_n = cfg.rerank_top_n
        self._threshold = cfg.rag_rerank_threshold

    def _score_sync(self, query: str, passages: list[str]) -> list[float]:
        model = _load_model(self._model_name)
        pairs = [(query, p) for p in passages]
        raw_scores = model.predict(pairs, show_progress_bar=False)
        return [_sigmoid(float(s)) for s in raw_scores]

    async def rerank(
        self,
        query: str,
        candidates: list[FusedResult],
        top_n: int | None = None,
    ) -> list[FusedResult]:
        if not candidates:
            return []

        effective_top_n = top_n or self._top_n
        # Only score the candidates we have (already limited by top_k upstream)
        passages = [c.content for c in candidates]

        scores = await asyncio.to_thread(self._score_sync, query, passages)

        ranked = sorted(
            (
                RankedResult(result=c, rerank_score=s)
                for c, s in zip(candidates, scores, strict=True)
            ),
            key=lambda r: r.rerank_score,
            reverse=True,
        )

        filtered = [r.result for r in ranked if r.rerank_score >= self._threshold]
        result = filtered[:effective_top_n]

        log.info(
            "reranker.done",
            candidates=len(candidates),
            after_threshold=len(filtered),
            returned=len(result),
            top_score=ranked[0].rerank_score if ranked else 0,
        )
        return result
