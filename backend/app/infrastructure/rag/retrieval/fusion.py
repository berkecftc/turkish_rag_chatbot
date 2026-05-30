"""Reciprocal Rank Fusion + weighted score normalization.

RRF (Cormack et al. 2009):
  score(d) = Σ_{r∈R} 1 / (k + rank_r(d))
  k=60 is empirically optimal (prevents top-ranked documents from dominating).

This module merges arbitrary ranked lists into a single combined ranking,
preserving all metadata needed downstream.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Union

from app.infrastructure.rag.retrieval.bm25_search import BM25Result
from app.infrastructure.rag.retrieval.vector_search import VectorResult


@dataclass
class FusedResult:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    content: str
    page: int | None
    section: str | None
    token_count: int
    vector_score: float | None
    bm25_score: float | None
    combined_score: float
    document_title: str
    source_type: str
    storage_key: str
    doc_created_at: str
    doc_updated_at: str
    chunk_metadata: dict = field(default_factory=dict)
    # Filled by reranker downstream
    rerank_score: float | None = None
    source_reliability: float | None = None


class ReciprocRankFusion:
    """Merges vector + BM25 results using RRF."""

    def __init__(self, k: int = 60) -> None:
        self._k = k

    def fuse(
        self,
        vector_results: list[VectorResult],
        bm25_results: list[BM25Result],
        vector_weight: float = 0.6,
        bm25_weight: float = 0.4,
    ) -> list[FusedResult]:
        # Index by chunk_id for deduplication
        index: dict[uuid.UUID, FusedResult] = {}

        def _base(r: Union[VectorResult, BM25Result]) -> FusedResult:
            vr = r if isinstance(r, VectorResult) else None
            br = r if isinstance(r, BM25Result) else None
            return FusedResult(
                chunk_id=r.chunk_id,
                document_id=r.document_id,
                content=r.content,
                page=r.page,
                section=r.section,
                token_count=r.token_count,
                vector_score=vr.vector_score if vr else None,
                bm25_score=br.bm25_score if br else None,
                combined_score=0.0,
                document_title=r.document_title,
                source_type=r.source_type,
                storage_key=r.storage_key,
                doc_created_at=r.doc_created_at,
                doc_updated_at=r.doc_updated_at,
                chunk_metadata=r.chunk_metadata,
            )

        # Apply RRF scores
        for rank, vr in enumerate(vector_results, start=1):
            if vr.chunk_id not in index:
                index[vr.chunk_id] = _base(vr)
            index[vr.chunk_id].combined_score += vector_weight * (1.0 / (self._k + rank))
            index[vr.chunk_id].vector_score = vr.vector_score

        for rank, br in enumerate(bm25_results, start=1):
            if br.chunk_id not in index:
                index[br.chunk_id] = _base(br)
            else:
                index[br.chunk_id].bm25_score = br.bm25_score
            index[br.chunk_id].combined_score += bm25_weight * (1.0 / (self._k + rank))

        results = sorted(index.values(), key=lambda r: r.combined_score, reverse=True)
        return results
