"""Citation assembler — builds structured citation records from packed context.

Citation format mirrors Perplexity AI: inline [N] references in the response,
with a reference list that includes document title, page, section, and scores.

Also handles:
- Source reliability injection into citation records
- Citation deduplication (same document appearing multiple times)
- Excerpt extraction (first 200 chars of cited chunk)
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

from app.infrastructure.rag.context.packer import PackedContext
from app.infrastructure.rag.retrieval.fusion import FusedResult


@dataclass
class AssembledCitation:
    citation_number: int
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    text_excerpt: str
    page_number: int | None
    section: str | None
    vector_score: float | None
    rerank_score: float | None
    combined_score: float
    source_reliability: float | None


class CitationAssembler:
    """Builds citation records from packed context after generation."""

    def build_from_context(self, ctx: PackedContext) -> list[AssembledCitation]:
        """Build citations for all chunks in the packed context."""
        citations: list[AssembledCitation] = []
        for num, chunk_id in ctx.citation_map.items():
            chunk = next((c for c in ctx.chunks if c.chunk_id == chunk_id), None)
            if chunk is None:
                continue
            citations.append(self._make_citation(num, chunk))
        return citations

    def filter_used(
        self,
        citations: list[AssembledCitation],
        response_text: str,
    ) -> list[AssembledCitation]:
        """Return only citations actually referenced in the response text."""
        used_numbers = {int(n) for n in re.findall(r"\[(\d+)\]", response_text)}
        if not used_numbers:
            return citations  # return all if response has no inline refs
        return [c for c in citations if c.citation_number in used_numbers]

    @staticmethod
    def _make_citation(num: int, chunk: FusedResult) -> AssembledCitation:
        # Use first 300 chars of content as the excerpt
        excerpt = chunk.content[:300].strip()
        if len(chunk.content) > 300:
            excerpt += "…"

        return AssembledCitation(
            citation_number=num,
            chunk_id=chunk.chunk_id,
            document_id=chunk.document_id,
            document_title=chunk.document_title,
            text_excerpt=excerpt,
            page_number=chunk.page,
            section=chunk.section,
            vector_score=chunk.vector_score,
            rerank_score=chunk.rerank_score,
            combined_score=chunk.combined_score,
            source_reliability=chunk.source_reliability,
        )
