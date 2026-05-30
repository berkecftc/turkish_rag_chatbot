"""Unit tests — ReciprocRankFusion."""
from __future__ import annotations

import uuid

import pytest

from app.infrastructure.rag.retrieval.bm25_search import BM25Result
from app.infrastructure.rag.retrieval.fusion import ReciprocRankFusion
from app.infrastructure.rag.retrieval.vector_search import VectorResult

# ── Helpers ───────────────────────────────────────────────────────────────────

_DOC_ID = uuid.uuid4()


def _vr(chunk_id: uuid.UUID | None = None, score: float = 0.8) -> VectorResult:
    return VectorResult(
        chunk_id=chunk_id or uuid.uuid4(),
        document_id=_DOC_ID,
        content="sample content",
        page=1,
        section=None,
        token_count=10,
        vector_score=score,
        document_title="Test Doc",
        source_type="pdf",
        storage_key="key/doc.pdf",
        doc_created_at="2024-01-01T00:00:00",
        doc_updated_at="2024-01-01T00:00:00",
        chunk_metadata={},
    )


def _br(chunk_id: uuid.UUID | None = None, score: float = 0.7) -> BM25Result:
    return BM25Result(
        chunk_id=chunk_id or uuid.uuid4(),
        document_id=_DOC_ID,
        content="sample content",
        page=1,
        section=None,
        token_count=10,
        bm25_score=score,
        document_title="Test Doc",
        source_type="pdf",
        storage_key="key/doc.pdf",
        doc_created_at="2024-01-01T00:00:00",
        doc_updated_at="2024-01-01T00:00:00",
        chunk_metadata={},
    )


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.fixture()
def rrf() -> ReciprocRankFusion:
    return ReciprocRankFusion(k=60)


class TestEmptyInputs:
    def test_both_empty_returns_empty(self, rrf):
        assert rrf.fuse([], [], 0.6, 0.4) == []

    def test_vector_only_empty_bm25(self, rrf):
        results = rrf.fuse([_vr()], [], 1.0, 0.0)
        assert len(results) == 1

    def test_bm25_only_empty_vector(self, rrf):
        results = rrf.fuse([], [_br()], 0.0, 1.0)
        assert len(results) == 1


class TestRanking:
    def test_results_sorted_descending_by_combined_score(self, rrf):
        vectors = [_vr() for _ in range(5)]
        fused = rrf.fuse(vectors, [], 1.0, 0.0)
        scores = [r.combined_score for r in fused]
        assert scores == sorted(scores, reverse=True)

    def test_higher_rank_yields_higher_score(self, rrf):
        v1, v2, v3 = _vr(), _vr(), _vr()
        fused = rrf.fuse([v1, v2, v3], [], 1.0, 0.0)
        # Rank 1 should outscore rank 2 which should outscore rank 3
        assert fused[0].combined_score > fused[1].combined_score > fused[2].combined_score

    def test_document_in_both_lists_outscores_single_list(self, rrf):
        shared_id = uuid.uuid4()
        unique_id = uuid.uuid4()

        shared_vr = _vr(chunk_id=shared_id)
        shared_br = _br(chunk_id=shared_id)
        unique_vr = _vr(chunk_id=unique_id)

        fused = rrf.fuse([shared_vr, unique_vr], [shared_br], 0.6, 0.4)
        scores = {r.chunk_id: r.combined_score for r in fused}
        assert scores[shared_id] > scores[unique_id]


class TestDeduplication:
    def test_same_chunk_id_appears_once(self, rrf):
        cid = uuid.uuid4()
        fused = rrf.fuse([_vr(chunk_id=cid)], [_br(chunk_id=cid)], 0.6, 0.4)
        assert len(fused) == 1

    def test_merged_chunk_carries_both_scores(self, rrf):
        cid = uuid.uuid4()
        vr = _vr(chunk_id=cid, score=0.9)
        br = _br(chunk_id=cid, score=0.8)
        fused = rrf.fuse([vr], [br], 0.6, 0.4)
        assert fused[0].vector_score == pytest.approx(0.9)
        assert fused[0].bm25_score == pytest.approx(0.8)

    def test_unique_chunks_all_appear(self, rrf):
        vectors = [_vr() for _ in range(3)]
        bm25s = [_br() for _ in range(3)]
        fused = rrf.fuse(vectors, bm25s, 0.6, 0.4)
        assert len(fused) == 6  # all unique


class TestWeighting:
    def test_k_parameter_scales_scores(self):
        v = [_vr()]
        score_low_k = ReciprocRankFusion(k=1).fuse(v, [], 1.0, 0.0)[0].combined_score
        score_high_k = ReciprocRankFusion(k=1000).fuse(v, [], 1.0, 0.0)[0].combined_score
        assert score_low_k > score_high_k

    def test_vector_weight_zero_gives_no_vector_contribution(self, rrf):
        v_only = _vr()
        b_only = _br()
        fused = rrf.fuse([v_only], [b_only], 0.0, 1.0)
        # bm25-only doc should outscore vector-only doc
        bm25_chunk = next(r for r in fused if r.bm25_score is not None and r.vector_score is None)
        vector_chunk = next(r for r in fused if r.vector_score is not None and r.bm25_score is None)
        assert bm25_chunk.combined_score > vector_chunk.combined_score
