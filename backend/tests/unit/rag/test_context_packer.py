"""Unit tests — ContextPacker."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.infrastructure.rag.retrieval.fusion import FusedResult


# ── Helpers ───────────────────────────────────────────────────────────────────

def _chunk(
    token_count: int = 10,
    content: str = "sample document content",
    rerank_score: float = 0.9,
    page: int | None = 1,
    section: str | None = "Section A",
) -> FusedResult:
    return FusedResult(
        chunk_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        content=content,
        page=page,
        section=section,
        token_count=token_count,
        vector_score=0.8,
        bm25_score=None,
        combined_score=0.8,
        document_title="Test Document",
        source_type="pdf",
        storage_key="docs/test.pdf",
        doc_created_at="2024-01-01T00:00:00",
        doc_updated_at="2024-01-01T00:00:00",
        rerank_score=rerank_score,
    )


def _make_packer(max_tokens: int = 100):
    """Build a ContextPacker with a mocked settings object."""
    mock_cfg = MagicMock()
    mock_cfg.rag_context_max_tokens = max_tokens
    with patch("app.infrastructure.rag.context.packer.get_settings", return_value=mock_cfg):
        from app.infrastructure.rag.context.packer import ContextPacker
        return ContextPacker()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestBasicPacking:
    def test_all_chunks_included_within_budget(self):
        packer = _make_packer(max_tokens=200)
        chunks = [_chunk(token_count=10) for _ in range(5)]
        ctx = packer.pack(chunks)
        assert len(ctx.chunks) == 5
        assert ctx.token_count == 50

    def test_empty_input_returns_empty_context(self):
        packer = _make_packer()
        ctx = packer.pack([])
        assert ctx.chunks == []
        assert ctx.token_count == 0
        assert ctx.formatted == ""
        assert ctx.citation_map == {}
        assert ctx.was_truncated is False

    def test_custom_max_tokens_overrides_config(self):
        packer = _make_packer(max_tokens=1000)
        chunks = [_chunk(token_count=15) for _ in range(10)]
        ctx = packer.pack(chunks, max_tokens=30)
        assert ctx.token_count <= 30


class TestTokenBudget:
    def test_over_budget_triggers_truncation(self):
        packer = _make_packer(max_tokens=50)
        chunks = [_chunk(token_count=15) for _ in range(5)]  # 75 total > 50
        ctx = packer.pack(chunks)
        assert ctx.token_count <= 50
        assert ctx.was_truncated is True

    def test_exactly_at_budget_not_truncated(self):
        packer = _make_packer(max_tokens=30)
        chunks = [_chunk(token_count=10) for _ in range(3)]  # exactly 30
        ctx = packer.pack(chunks)
        assert ctx.token_count == 30
        assert ctx.was_truncated is False

    def test_single_oversized_chunk_is_skipped(self):
        packer = _make_packer(max_tokens=10)
        small = _chunk(token_count=8)
        big = _chunk(token_count=50)
        ctx = packer.pack([big, small])
        # big is skipped, small fits
        assert small.chunk_id in ctx.citation_map.values()
        assert big.chunk_id not in ctx.citation_map.values()


class TestCitationMap:
    def test_citation_numbers_start_at_one(self):
        packer = _make_packer()
        chunks = [_chunk() for _ in range(3)]
        ctx = packer.pack(chunks)
        assert min(ctx.citation_map.keys()) == 1

    def test_citation_numbers_are_sequential(self):
        packer = _make_packer()
        chunks = [_chunk() for _ in range(4)]
        ctx = packer.pack(chunks)
        assert list(ctx.citation_map.keys()) == [1, 2, 3, 4]

    def test_citation_map_keys_match_chunk_ids(self):
        packer = _make_packer()
        chunks = [_chunk() for _ in range(3)]
        ctx = packer.pack(chunks)
        for num, cid in ctx.citation_map.items():
            assert cid == ctx.chunks[num - 1].chunk_id


class TestFormattedOutput:
    def test_document_title_in_formatted(self):
        packer = _make_packer()
        ctx = packer.pack([_chunk()])
        assert "Test Document" in ctx.formatted

    def test_citation_number_marker_in_formatted(self):
        packer = _make_packer()
        ctx = packer.pack([_chunk()])
        assert "[1]" in ctx.formatted

    def test_page_number_in_formatted_when_present(self):
        packer = _make_packer()
        ctx = packer.pack([_chunk(page=5)])
        assert "p.5" in ctx.formatted

    def test_section_in_formatted_when_present(self):
        packer = _make_packer()
        ctx = packer.pack([_chunk(section="Revenue Analysis")])
        assert "Revenue Analysis" in ctx.formatted

    def test_multiple_chunks_separated_by_divider(self):
        packer = _make_packer(max_tokens=200)
        chunks = [_chunk() for _ in range(2)]
        ctx = packer.pack(chunks)
        assert "---" in ctx.formatted
