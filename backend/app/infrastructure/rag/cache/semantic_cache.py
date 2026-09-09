"""Semantic query cache backed by pgvector similarity search.

Cache lookup:
1. Compute SHA-256 of (tenant_id + normalized_query) for exact-match fast-path.
2. If no exact match, search the semantic_cache table for the embedding nearest
   to the query embedding within the similarity threshold.
3. On hit: increment hit_count, return cached response.
4. On miss: execute the full pipeline, then store result with TTL.

Storage: PostgreSQL (semantic_cache table) rather than Redis because:
- Embedding similarity requires pgvector index (HNSW).
- Exact-hash fast-path is added for very common queries.
- Redis would require a separate RediSearch setup.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.modules.rag.models import SemanticCache
from app.modules.rag.repository import SemanticCacheRepository

log = get_logger("cache.semantic")


def _cache_key(tenant_id: uuid.UUID, user_id: uuid.UUID, query: str) -> str:
    # user_id in the key isolates cache entries per user (documents are
    # owner-scoped, so a cached answer must not cross users).
    raw = f"{tenant_id}:{user_id}:{query.strip().lower()}"
    return hashlib.sha256(raw.encode()).hexdigest()


class SemanticCacheLayer:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        cfg = get_settings()
        self._ttl = cfg.rag_semantic_cache_ttl_seconds
        self._sim_threshold = cfg.rag_cache_similarity_threshold
        # Placeholder tenant id; the real tenant is passed per call.
        self._repo = SemanticCacheRepository(self._session, uuid.UUID(int=0))

    async def lookup(
        self,
        *,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        query: str,
        query_embedding: list[float],
    ) -> dict | None:
        self._repo.tenant_id = tenant_id
        q_hash = _cache_key(tenant_id, user_id, query)

        # Fast-path: exact hash match
        from sqlalchemy import select
        stmt = select(SemanticCache).where(
            SemanticCache.tenant_id == tenant_id,
            SemanticCache.user_id == user_id,
            SemanticCache.query_hash == q_hash,
            SemanticCache.expires_at > datetime.now(UTC).replace(tzinfo=None),
        )
        exact = (await self._session.execute(stmt)).scalar_one_or_none()
        if exact is not None:
            await self._repo.increment_hit(exact.id)
            log.info("cache.hit", kind="exact", tenant=str(tenant_id))
            return exact.response_json

        # Semantic similarity match (scoped to this user)
        similar = await self._repo.find_similar(
            tenant_id=tenant_id,
            user_id=user_id,
            query_embedding=query_embedding,
            threshold=self._sim_threshold,
        )
        if similar is not None:
            await self._repo.increment_hit(similar.id)
            log.info("cache.hit", kind="semantic", tenant=str(tenant_id))
            return similar.response_json

        return None

    async def store(
        self,
        *,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        query: str,
        query_embedding: list[float],
        response: dict,
    ) -> None:
        q_hash = _cache_key(tenant_id, user_id, query)
        expires = datetime.now(UTC).replace(tzinfo=None) + timedelta(seconds=self._ttl)
        entry = SemanticCache(
            tenant_id=tenant_id,
            user_id=user_id,
            query_hash=q_hash,
            query_embedding=query_embedding,
            original_query=query,
            response_json=response,
            expires_at=expires,
        )
        self._session.add(entry)
        log.info("cache.stored", tenant=str(tenant_id), expires=expires.isoformat())
