"""pgvector semantic search engine.

Uses cosine distance operator (<=>).  Returns results sorted by similarity
(highest first) with tenant isolation and document-status guard baked in.
Optionally filters by document_ids, source_types, or date ranges.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger

log = get_logger("retrieval.vector")


@dataclass
class VectorResult:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    content: str
    page: int | None
    section: str | None
    token_count: int
    vector_score: float
    document_title: str
    source_type: str
    storage_key: str
    doc_created_at: str
    doc_updated_at: str
    chunk_metadata: dict


_BASE_QUERY = """
SELECT
    c.id                                                        AS chunk_id,
    c.document_id,
    c.content,
    c.page,
    c.section,
    c.token_count,
    1 - (c.embedding <=> CAST(:embedding AS vector))           AS vector_score,
    d.title                                                     AS document_title,
    d.source_type,
    d.storage_key,
    d.created_at                                                AS doc_created_at,
    d.updated_at                                                AS doc_updated_at,
    c.metadata                                                  AS chunk_metadata
FROM chunks c
JOIN documents d ON d.id = c.document_id
WHERE c.tenant_id   = :tenant_id
  AND d.status      = 'ready'
  AND d.deleted_at  IS NULL
  AND c.embedding   IS NOT NULL
  {extra_where}
ORDER BY c.embedding <=> CAST(:embedding AS vector)
LIMIT :top_k
"""


class VectorSearchEngine:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def search(
        self,
        *,
        tenant_id: uuid.UUID,
        query_embedding: list[float],
        top_k: int,
        document_ids: list[uuid.UUID] | None = None,
        source_types: list[str] | None = None,
    ) -> list[VectorResult]:
        extra_clauses: list[str] = []
        params: dict = {
            "tenant_id": str(tenant_id),
            "embedding": json.dumps(query_embedding),
            "top_k": top_k,
        }

        if document_ids:
            placeholders = ", ".join(f":doc_{i}" for i in range(len(document_ids)))
            extra_clauses.append(f"AND d.id IN ({placeholders})")
            for i, did in enumerate(document_ids):
                params[f"doc_{i}"] = str(did)

        if source_types:
            placeholders = ", ".join(f":st_{i}" for i in range(len(source_types)))
            extra_clauses.append(f"AND d.source_type IN ({placeholders})")
            for i, st in enumerate(source_types):
                params[f"st_{i}"] = st

        extra_where = "\n  ".join(extra_clauses)
        query = text(_BASE_QUERY.format(extra_where=extra_where))
        result = await self._session.execute(query, params)
        rows = result.fetchall()

        return [
            VectorResult(
                chunk_id=uuid.UUID(str(r.chunk_id)),
                document_id=uuid.UUID(str(r.document_id)),
                content=r.content,
                page=r.page,
                section=r.section,
                token_count=r.token_count,
                vector_score=float(r.vector_score),
                document_title=r.document_title,
                source_type=r.source_type,
                storage_key=r.storage_key,
                doc_created_at=str(r.doc_created_at),
                doc_updated_at=str(r.doc_updated_at),
                chunk_metadata=r.chunk_metadata or {},
            )
            for r in rows
        ]
