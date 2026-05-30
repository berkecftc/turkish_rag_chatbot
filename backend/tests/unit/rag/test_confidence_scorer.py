"""Unit tests — ConfidenceScorer."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.infrastructure.rag.generation.validator import ValidationResult
from app.infrastructure.rag.retrieval.fusion import FusedResult


# ── Helpers ───────────────────────────────────────────────────────────────────

def _chunk(rerank_score: float | None = 0.85, combined_score: float = 0.75) -> FusedResult:
    c = FusedResult(
        chunk_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        content="test chunk",
        page=1,
        section=None,
        token_count=10,
        vector_score=combined_score,
        bm25_score=None,
        combined_score=combined_score,
        document_title="Doc",
        source_type="pdf",
        storage_key="key",
        doc_created_at="2024-01-01T00:00:00",
        doc_updated_at="2024-01-01T00:00:00",
        rerank_score=rerank_score,
    )
    return c


def _validation(confidence: float = 0.8, flags: list[str] | None = None) -> ValidationResult:
    return ValidationResult(
        confidence=confidence,
        hallucination_flags=flags or [],
        per_sentence_scores=[],
    )


def _make_scorer(threshold: float = 0.3):
    mock_cfg = MagicMock()
    mock_cfg.rag_confidence_threshold = threshold
    with patch("app.infrastructure.rag.confidence.scorer.get_settings", return_value=mock_cfg):
        from app.infrastructure.rag.confidence.scorer import ConfidenceScorer
        return ConfidenceScorer()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestScoreBounds:
    def test_score_bounded_between_0_and_1(self):
        scorer = _make_scorer()
        chunks = [_chunk(rerank_score=1.0, combined_score=1.0)]
        score = scorer.score(
            reranked_chunks=chunks,
            all_chunks=chunks,
            validation=_validation(confidence=1.0),
            citation_count=1,
            context_chunk_count=1,
        )
        assert 0.0 <= score <= 1.0

    def test_zero_score_for_empty_results(self):
        scorer = _make_scorer()
        score = scorer.score(
            reranked_chunks=[],
            all_chunks=[],
            validation=_validation(confidence=0.0),
            citation_count=0,
            context_chunk_count=0,
        )
        assert score == pytest.approx(0.0)

    def test_score_is_rounded_to_4_decimals(self):
        scorer = _make_scorer()
        chunks = [_chunk()]
        score = scorer.score(
            reranked_chunks=chunks,
            all_chunks=chunks,
            validation=_validation(),
            citation_count=1,
            context_chunk_count=1,
        )
        assert score == round(score, 4)


class TestCompositeFactors:
    def test_high_rerank_scores_increase_confidence(self):
        scorer = _make_scorer()
        high_chunks = [_chunk(rerank_score=0.95)]
        low_chunks = [_chunk(rerank_score=0.1)]
        val = _validation(confidence=0.7)

        high_score = scorer.score(
            reranked_chunks=high_chunks, all_chunks=high_chunks,
            validation=val, citation_count=1, context_chunk_count=1,
        )
        low_score = scorer.score(
            reranked_chunks=low_chunks, all_chunks=low_chunks,
            validation=val, citation_count=1, context_chunk_count=1,
        )
        assert high_score > low_score

    def test_high_citation_density_increases_confidence(self):
        scorer = _make_scorer()
        chunks = [_chunk() for _ in range(4)]
        val = _validation(confidence=0.7)

        full_density = scorer.score(
            reranked_chunks=chunks, all_chunks=chunks,
            validation=val, citation_count=4, context_chunk_count=4,
        )
        zero_density = scorer.score(
            reranked_chunks=chunks, all_chunks=chunks,
            validation=val, citation_count=0, context_chunk_count=4,
        )
        assert full_density > zero_density

    def test_high_validation_confidence_increases_score(self):
        scorer = _make_scorer()
        chunks = [_chunk()]

        high_val = scorer.score(
            reranked_chunks=chunks, all_chunks=chunks,
            validation=_validation(confidence=0.95),
            citation_count=1, context_chunk_count=1,
        )
        low_val = scorer.score(
            reranked_chunks=chunks, all_chunks=chunks,
            validation=_validation(confidence=0.1),
            citation_count=1, context_chunk_count=1,
        )
        assert high_val > low_val

    def test_fallback_to_combined_score_when_no_rerank(self):
        scorer = _make_scorer()
        chunks = [_chunk(rerank_score=None, combined_score=0.6)]
        score = scorer.score(
            reranked_chunks=chunks, all_chunks=chunks,
            validation=_validation(confidence=0.7),
            citation_count=1, context_chunk_count=1,
        )
        assert score > 0.0

    def test_no_validation_uses_default_half(self):
        scorer = _make_scorer()
        chunks = [_chunk()]
        score = scorer.score(
            reranked_chunks=chunks, all_chunks=chunks,
            validation=None,
            citation_count=1, context_chunk_count=1,
        )
        assert score > 0.0


class TestLowConfidenceThreshold:
    def test_is_low_confidence_below_threshold(self):
        scorer = _make_scorer(threshold=0.4)
        assert scorer.is_low_confidence(0.39) is True

    def test_is_not_low_confidence_above_threshold(self):
        scorer = _make_scorer(threshold=0.4)
        assert scorer.is_low_confidence(0.41) is False

    def test_exactly_at_threshold_is_not_low(self):
        scorer = _make_scorer(threshold=0.3)
        assert scorer.is_low_confidence(0.3) is False
