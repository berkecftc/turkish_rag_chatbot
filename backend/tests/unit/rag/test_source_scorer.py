"""Unit tests — SourceReliabilityScorer."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.infrastructure.rag.retrieval.fusion import FusedResult


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _days_ago_iso(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _chunk(doc_updated_at: str = "") -> FusedResult:
    return FusedResult(
        chunk_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        content="chunk text",
        page=1,
        section=None,
        token_count=10,
        vector_score=0.8,
        bm25_score=None,
        combined_score=0.8,
        document_title="Report",
        source_type="pdf",
        storage_key="key",
        doc_created_at="2024-01-01T00:00:00",
        doc_updated_at=doc_updated_at or _now_iso(),
    )


def _make_scorer(decay_days: int = 365):
    mock_cfg = MagicMock()
    mock_cfg.rag_source_freshness_decay_days = decay_days
    with patch(
        "app.infrastructure.rag.reliability.source_scorer.get_settings",
        return_value=mock_cfg,
    ):
        from app.infrastructure.rag.reliability.source_scorer import SourceReliabilityScorer
        return SourceReliabilityScorer()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestFreshnessScoring:
    def test_today_document_scores_high(self):
        scorer = _make_scorer()
        doc_id = uuid.uuid4()
        score = scorer.score_chunk(_now_iso(), doc_id)
        assert score > 0.5

    def test_old_document_scores_low(self):
        scorer = _make_scorer(decay_days=365)
        doc_id = uuid.uuid4()
        two_years_ago = _days_ago_iso(730)
        score = scorer.score_chunk(two_years_ago, doc_id)
        assert score < 0.35

    def test_fresher_document_scores_higher(self):
        scorer = _make_scorer()
        doc_id = uuid.uuid4()
        score_fresh = scorer.score_chunk(_days_ago_iso(30), doc_id)
        score_old = scorer.score_chunk(_days_ago_iso(300), doc_id)
        assert score_fresh > score_old

    def test_invalid_date_falls_back_to_neutral(self):
        scorer = _make_scorer()
        doc_id = uuid.uuid4()
        score = scorer.score_chunk("not-a-date", doc_id)
        # 0.5 freshness default * 0.60 weight = 0.30
        assert score == pytest.approx(0.30, abs=0.01)

    def test_none_date_falls_back(self):
        scorer = _make_scorer()
        doc_id = uuid.uuid4()
        score = scorer.score_chunk(None, doc_id)  # type: ignore[arg-type]
        assert 0.0 <= score <= 1.0


class TestCitationFrequency:
    def test_no_citations_gives_zero_citation_factor(self):
        scorer = _make_scorer()
        doc_id = uuid.uuid4()
        scorer.set_citation_frequencies({})
        score_no_cit = scorer.score_chunk(_now_iso(), doc_id)

        # With max citations, score should be higher
        scorer.set_citation_frequencies({doc_id: 100})
        score_with_cit = scorer.score_chunk(_now_iso(), doc_id)

        assert score_with_cit > score_no_cit

    def test_set_citation_frequencies_updates_normalizer(self):
        scorer = _make_scorer()
        doc_a = uuid.uuid4()
        doc_b = uuid.uuid4()
        scorer.set_citation_frequencies({doc_a: 10, doc_b: 5})

        score_a = scorer.score_chunk(_now_iso(), doc_a)
        score_b = scorer.score_chunk(_now_iso(), doc_b)
        assert score_a > score_b

    def test_max_citation_normalizes_to_one(self):
        scorer = _make_scorer()
        doc_id = uuid.uuid4()
        scorer.set_citation_frequencies({doc_id: 1000})
        score = scorer.score_chunk(_now_iso(), doc_id)
        assert score <= 1.0


class TestAnnotate:
    def test_annotate_sets_reliability_on_all_chunks(self):
        scorer = _make_scorer()
        chunks = [_chunk() for _ in range(3)]
        scorer.annotate(chunks)
        assert all(c.source_reliability is not None for c in chunks)

    def test_annotated_reliability_is_bounded(self):
        scorer = _make_scorer()
        chunks = [_chunk() for _ in range(5)]
        scorer.annotate(chunks)
        for c in chunks:
            assert 0.0 <= c.source_reliability <= 1.0

    def test_annotate_empty_list_is_safe(self):
        scorer = _make_scorer()
        scorer.annotate([])  # must not raise

    def test_annotate_with_citation_frequencies(self):
        scorer = _make_scorer()
        chunk = _chunk()
        scorer.set_citation_frequencies({chunk.document_id: 50})
        scorer.annotate([chunk])
        assert chunk.source_reliability > 0.0


class TestScoreBounds:
    def test_score_always_in_0_1_range(self):
        scorer = _make_scorer()
        doc_id = uuid.uuid4()
        # Test extremes
        for days in [0, 1, 30, 365, 1000, 3000]:
            score = scorer.score_chunk(_days_ago_iso(days), doc_id)
            assert 0.0 <= score <= 1.0, f"Out of bounds at {days} days: {score}"
