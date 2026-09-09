"""PostgreSQL full-text / BM25-approximating search engine.

Uses tsvector + ts_rank_cd for BM25-like scoring.  Falls back to 'simple'
language config if Turkish FTS dictionary is not installed.

Trade-off vs vector search:
- Stronger on exact keyword matches, acronyms, named entities
- Weaker on semantic paraphrases and synonyms
- Critical for legal/financial queries where exact terms matter
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger

log = get_logger("retrieval.bm25")


@dataclass
class BM25Result:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    content: str
    page: int | None
    section: str | None
    token_count: int
    bm25_score: float
    document_title: str
    source_type: str
    storage_key: str
    doc_created_at: str
    doc_updated_at: str
    chunk_metadata: dict


_QUERY_TEMPLATE = """
SELECT
    c.id                                                                    AS chunk_id,
    c.document_id,
    c.content,
    c.page,
    c.section,
    c.token_count,
    ts_rank_cd(c.content_tsv, query, 32)                                   AS bm25_score,
    d.title                                                                 AS document_title,
    d.source_type,
    d.storage_key,
    d.created_at                                                            AS doc_created_at,
    d.updated_at                                                            AS doc_updated_at,
    c.metadata                                                              AS chunk_metadata
FROM chunks c
JOIN documents d ON d.id = c.document_id,
plainto_tsquery(:lang_config, :query_text) AS query
WHERE c.tenant_id   = :tenant_id
  AND d.owner_id    = :owner_id
  AND d.status      = 'ready'
  AND d.deleted_at  IS NULL
  AND c.content_tsv IS NOT NULL
  AND c.content_tsv @@ query
  {extra_where}
ORDER BY bm25_score DESC
LIMIT :top_k
"""

_FALLBACK_QUERY = """
SELECT
    c.id                                                                    AS chunk_id,
    c.document_id,
    c.content,
    c.page,
    c.section,
    c.token_count,
    ts_rank_cd(
        to_tsvector('simple', c.content), plainto_tsquery('simple', :query_text), 32
    ) AS bm25_score,
    d.title                                                                 AS document_title,
    d.source_type,
    d.storage_key,
    d.created_at                                                            AS doc_created_at,
    d.updated_at                                                            AS doc_updated_at,
    c.metadata                                                              AS chunk_metadata
FROM chunks c
JOIN documents d ON d.id = c.document_id
WHERE c.tenant_id  = :tenant_id
  AND d.owner_id   = :owner_id
  AND d.status     = 'ready'
  AND d.deleted_at IS NULL
  AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', :query_text)
  {extra_where}
ORDER BY bm25_score DESC
LIMIT :top_k
"""


class BM25SearchEngine:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._lang_config = "turkish"  # requires unaccent + turkish FTS dict

    async def search(
        self,
        *,
        tenant_id: uuid.UUID,
        owner_id: uuid.UUID,
        query_text: str,
        top_k: int,
        is_turkish: bool = True,
        document_ids: list[uuid.UUID] | None = None,
        source_types: list[str] | None = None,
    ) -> list[BM25Result]:
        extra_clauses: list[str] = []
        params: dict = {
            "tenant_id": str(tenant_id),
            "owner_id": str(owner_id),
            "query_text": query_text,
            "top_k": top_k,
            "lang_config": self._lang_config if is_turkish else "english",
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

        try:
            async with self._session.begin_nested():
                q = text(_QUERY_TEMPLATE.format(extra_where=extra_where))
                result = await self._session.execute(q, params)
                rows = result.fetchall()
        except Exception:
            log.warning("bm25.turkish_fts_unavailable", fallback="simple")
            q = text(_FALLBACK_QUERY.format(extra_where=extra_where))
            if "lang_config" in params:
                del params["lang_config"]
            result = await self._session.execute(q, params)
            rows = result.fetchall()

        return [
            BM25Result(
                chunk_id=uuid.UUID(str(r.chunk_id)),
                document_id=uuid.UUID(str(r.document_id)),
                content=r.content,
                page=r.page,
                section=r.section,
                token_count=r.token_count,
                bm25_score=float(r.bm25_score),
                document_title=r.document_title,
                source_type=r.source_type,
                storage_key=r.storage_key,
                doc_created_at=str(r.doc_created_at),
                doc_updated_at=str(r.doc_updated_at),
                chunk_metadata=r.chunk_metadata or {},
            )
            for r in rows
        ]
