"""Adaptive hybrid retrieval engine.

Combines vector search and BM25 with intent-aware weight adjustment:

  Query Intent  │ Vector │ BM25  │ Rationale
  ─────────────────────────────────────────────────────────────────
  FACTUAL       │  0.60  │ 0.40  │ Balanced
  LEGAL         │  0.35  │ 0.65  │ Exact terms critical
  FINANCIAL     │  0.50  │ 0.50  │ Balanced (numbers + semantics)
  SUMMARIZATION │  0.70  │ 0.30  │ Semantic scope
  ANALYTICAL    │  0.65  │ 0.35  │ Semantic reasoning
  COMPARISON    │  0.60  │ 0.40  │ Balanced
  CONVERSATIONAL│  0.75  │ 0.25  │ Semantic heavy

Sub-questions from the query rewriter are used for multi-hop retrieval
(each sub-question is retrieved separately, then fused together).
"""
from __future__ import annotations

import asyncio
import uuid

from app.core.config import get_settings
from app.core.logging import get_logger
from app.infrastructure.rag.query.processor import QueryIntent
from app.infrastructure.rag.retrieval.bm25_search import BM25SearchEngine
from app.infrastructure.rag.retrieval.fusion import FusedResult, ReciprocRankFusion
from app.infrastructure.rag.retrieval.vector_search import VectorSearchEngine
from app.modules.rag.schemas import MetadataFilter

log = get_logger("retrieval.hybrid")

# (vector_weight, bm25_weight) per intent
_ADAPTIVE_WEIGHTS: dict[QueryIntent, tuple[float, float]] = {
    QueryIntent.FACTUAL:       (0.60, 0.40),
    QueryIntent.LEGAL:         (0.35, 0.65),
    QueryIntent.FINANCIAL:     (0.50, 0.50),
    QueryIntent.SUMMARIZATION: (0.70, 0.30),
    QueryIntent.ANALYTICAL:    (0.65, 0.35),
    QueryIntent.COMPARISON:    (0.60, 0.40),
    QueryIntent.CONVERSATIONAL:(0.75, 0.25),
}


class HybridRetriever:
    def __init__(
        self,
        vector_engine: VectorSearchEngine,
        bm25_engine: BM25SearchEngine,
    ) -> None:
        self._vector = vector_engine
        self._bm25 = bm25_engine
        self._rrf = ReciprocRankFusion(k=get_settings().rag_rrf_k)
        cfg = get_settings()
        self._default_vector_w = cfg.rag_hybrid_vector_weight
        self._default_bm25_w = cfg.rag_hybrid_bm25_weight
        self._top_k = cfg.retrieval_top_k

    async def retrieve(
        self,
        *,
        tenant_id: uuid.UUID,
        owner_id: uuid.UUID,
        query_text: str,
        query_embedding: list[float],
        intent: QueryIntent,
        is_turkish: bool = True,
        filters: MetadataFilter | None = None,
        sub_questions: list[str] | None = None,
        sub_embeddings: list[list[float]] | None = None,
    ) -> tuple[list[FusedResult], float, float]:
        """Returns (fused_results, vector_weight, bm25_weight)."""
        vector_w, bm25_w = _ADAPTIVE_WEIGHTS.get(
            intent, (self._default_vector_w, self._default_bm25_w)
        )

        doc_ids = (
            [str(d) for d in filters.document_ids] if filters and filters.document_ids else None
        )
        src_types = filters.source_types if filters and filters.source_types else None

        # Primary retrieval
        vector_task = self._vector.search(
            tenant_id=tenant_id,
            owner_id=owner_id,
            query_embedding=query_embedding,
            top_k=self._top_k,
            document_ids=doc_ids,
            source_types=src_types,
        )
        bm25_task = self._bm25.search(
            tenant_id=tenant_id,
            owner_id=owner_id,
            query_text=query_text,
            top_k=self._top_k,
            is_turkish=is_turkish,
            document_ids=doc_ids,
            source_types=src_types,
        )

        tasks = [vector_task, bm25_task]

        # Multi-hop: sub-questions
        if sub_questions and sub_embeddings:
            for sub_q, sub_emb in zip(sub_questions[:2], sub_embeddings[:2], strict=False):
                tasks.append(
                    self._vector.search(
                        tenant_id=tenant_id,
                        owner_id=owner_id,
                        query_embedding=sub_emb,
                        top_k=self._top_k // 2,
                        document_ids=doc_ids,
                        source_types=src_types,
                    )
                )
                tasks.append(
                    self._bm25.search(
                        tenant_id=tenant_id,
                        owner_id=owner_id,
                        query_text=sub_q,
                        top_k=self._top_k // 2,
                        is_turkish=is_turkish,
                        document_ids=doc_ids,
                        source_types=src_types,
                    )
                )

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Collect results, skip failed sub-retrievals
        vector_results = results[0] if not isinstance(results[0], Exception) else []
        bm25_results = results[1] if not isinstance(results[1], Exception) else []

        for i in range(2, len(results), 2):
            if not isinstance(results[i], Exception):
                vector_results = list(vector_results) + list(results[i])
            if i + 1 < len(results) and not isinstance(results[i + 1], Exception):
                bm25_results = list(bm25_results) + list(results[i + 1])

        fused = self._rrf.fuse(vector_results, bm25_results, vector_w, bm25_w)

        log.info(
            "retrieval.done",
            vector=len(vector_results),
            bm25=len(bm25_results),
            fused=len(fused),
            vector_w=vector_w,
            bm25_w=bm25_w,
        )
        return fused, vector_w, bm25_w
