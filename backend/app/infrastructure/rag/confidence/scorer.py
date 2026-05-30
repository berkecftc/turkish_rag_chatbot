"""Multi-factor confidence scoring system.

Confidence is a composite score from:

  Factor                     │ Weight │ Description
  ─────────────────────────────────────────────────────────────────────────
  Reranker scores            │  0.40  │ Average top-3 rerank scores
  Retrieval quality          │  0.25  │ Max combined_score of top result
  Citation density           │  0.15  │ citations_used / chunks_in_context
  Semantic validation        │  0.20  │ HallucinationValidator output

Final score is in [0.0, 1.0].  Scores below rag_confidence_threshold (0.3)
trigger a low-confidence warning in the API response.
"""
from __future__ import annotations

from app.core.config import get_settings
from app.infrastructure.rag.generation.validator import ValidationResult
from app.infrastructure.rag.retrieval.fusion import FusedResult


class ConfidenceScorer:
    def __init__(self) -> None:
        self._threshold = get_settings().rag_confidence_threshold

    def score(
        self,
        *,
        reranked_chunks: list[FusedResult],
        all_chunks: list[FusedResult],
        validation: ValidationResult | None,
        citation_count: int,
        context_chunk_count: int,
    ) -> float:
        rerank_score = self._rerank_factor(reranked_chunks)
        retrieval_score = self._retrieval_factor(all_chunks)
        citation_density = self._citation_density(citation_count, context_chunk_count)
        validation_score = validation.confidence if validation else 0.5

        composite = (
            0.40 * rerank_score
            + 0.25 * retrieval_score
            + 0.15 * citation_density
            + 0.20 * validation_score
        )
        return round(min(max(composite, 0.0), 1.0), 4)

    @staticmethod
    def _rerank_factor(chunks: list[FusedResult]) -> float:
        if not chunks:
            return 0.0
        top3_scores = [
            c.rerank_score for c in chunks[:3] if c.rerank_score is not None
        ]
        if not top3_scores:
            # Fall back to combined_score if reranker wasn't run
            top3_scores = [c.combined_score for c in chunks[:3]]
        return sum(top3_scores) / len(top3_scores)

    @staticmethod
    def _retrieval_factor(chunks: list[FusedResult]) -> float:
        if not chunks:
            return 0.0
        return chunks[0].combined_score

    @staticmethod
    def _citation_density(cited: int, total: int) -> float:
        if total == 0:
            return 0.0
        return min(cited / total, 1.0)

    def is_low_confidence(self, score: float) -> bool:
        return score < self._threshold
