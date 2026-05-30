"""Unit tests — CitationAssembler."""
from __future__ import annotations

import uuid

import pytest

from app.infrastructure.rag.citation.assembler import AssembledCitation, CitationAssembler
from app.infrastructure.rag.context.packer import PackedContext
from app.infrastructure.rag.retrieval.fusion import FusedResult


# ── Helpers ───────────────────────────────────────────────────────────────────

def _chunk(
    content: str = "This is the chunk content for the citation test.",
    page: int | None = 3,
    section: str | None = "Section B",
    rerank_score: float = 0.9,
    source_reliability: float | None = 0.8,
) -> FusedResult:
    return FusedResult(
        chunk_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        content=content,
        page=page,
        section=section,
        token_count=15,
        vector_score=0.88,
        bm25_score=0.72,
        combined_score=0.83,
        document_title="Enterprise Report 2024",
        source_type="pdf",
        storage_key="docs/report.pdf",
        doc_created_at="2024-01-01T00:00:00",
        doc_updated_at="2024-01-01T00:00:00",
        rerank_score=rerank_score,
        source_reliability=source_reliability,
    )


def _packed(chunks: list[FusedResult]) -> PackedContext:
    citation_map = {i + 1: c.chunk_id for i, c in enumerate(chunks)}
    return PackedContext(
        formatted="context text",
        chunks=chunks,
        token_count=sum(c.token_count for c in chunks),
        was_truncated=False,
        citation_map=citation_map,
    )


@pytest.fixture()
def assembler() -> CitationAssembler:
    return CitationAssembler()


# ── build_from_context ────────────────────────────────────────────────────────

class TestBuildFromContext:
    def test_returns_one_citation_per_chunk(self, assembler):
        ctx = _packed([_chunk() for _ in range(4)])
        citations = assembler.build_from_context(ctx)
        assert len(citations) == 4

    def test_citation_numbers_sequential_from_one(self, assembler):
        ctx = _packed([_chunk() for _ in range(3)])
        citations = assembler.build_from_context(ctx)
        assert [c.citation_number for c in citations] == [1, 2, 3]

    def test_empty_context_returns_empty(self, assembler):
        ctx = _packed([])
        assert assembler.build_from_context(ctx) == []

    def test_metadata_preserved_page_section(self, assembler):
        chunk = _chunk(page=7, section="Financial Summary")
        ctx = _packed([chunk])
        citation = assembler.build_from_context(ctx)[0]
        assert citation.page_number == 7
        assert citation.section == "Financial Summary"

    def test_scores_preserved(self, assembler):
        chunk = _chunk(rerank_score=0.95, source_reliability=0.75)
        ctx = _packed([chunk])
        citation = assembler.build_from_context(ctx)[0]
        assert citation.rerank_score == pytest.approx(0.95)
        assert citation.source_reliability == pytest.approx(0.75)
        assert citation.vector_score == pytest.approx(0.88)

    def test_document_title_preserved(self, assembler):
        ctx = _packed([_chunk()])
        citation = assembler.build_from_context(ctx)[0]
        assert citation.document_title == "Enterprise Report 2024"

    def test_excerpt_capped_at_300_chars(self, assembler):
        long_content = "x" * 500
        ctx = _packed([_chunk(content=long_content)])
        citation = assembler.build_from_context(ctx)[0]
        assert citation.text_excerpt.endswith("…")
        # 300 content chars + ellipsis
        assert len(citation.text_excerpt) <= 301

    def test_short_content_not_ellipsised(self, assembler):
        ctx = _packed([_chunk(content="Short content.")])
        citation = assembler.build_from_context(ctx)[0]
        assert not citation.text_excerpt.endswith("…")

    def test_chunk_id_and_doc_id_match(self, assembler):
        chunk = _chunk()
        ctx = _packed([chunk])
        citation = assembler.build_from_context(ctx)[0]
        assert citation.chunk_id == chunk.chunk_id
        assert citation.document_id == chunk.document_id


# ── filter_used ───────────────────────────────────────────────────────────────

class TestFilterUsed:
    def test_returns_only_referenced_citations(self, assembler):
        chunks = [_chunk() for _ in range(4)]
        ctx = _packed(chunks)
        citations = assembler.build_from_context(ctx)
        used = assembler.filter_used(citations, "Answer [1] with context [3].")
        assert {c.citation_number for c in used} == {1, 3}

    def test_returns_all_when_no_inline_refs(self, assembler):
        chunks = [_chunk() for _ in range(3)]
        ctx = _packed(chunks)
        citations = assembler.build_from_context(ctx)
        used = assembler.filter_used(citations, "No citation markers in this response.")
        assert len(used) == 3

    def test_reference_to_nonexistent_number_excluded(self, assembler):
        chunks = [_chunk()]
        ctx = _packed(chunks)
        citations = assembler.build_from_context(ctx)
        used = assembler.filter_used(citations, "See [99] for details.")
        assert len(used) == 0

    def test_multiple_refs_to_same_number_deduplicated(self, assembler):
        chunks = [_chunk() for _ in range(2)]
        ctx = _packed(chunks)
        citations = assembler.build_from_context(ctx)
        used = assembler.filter_used(citations, "As stated [1] and reiterated [1] again [1].")
        assert len(used) == 1
        assert used[0].citation_number == 1

    def test_multi_citation_bracket_parsed(self, assembler):
        chunks = [_chunk() for _ in range(3)]
        ctx = _packed(chunks)
        citations = assembler.build_from_context(ctx)
        # [1][2] — two separate brackets
        used = assembler.filter_used(citations, "Evidence [1][2] supports this.")
        assert {c.citation_number for c in used} == {1, 2}
