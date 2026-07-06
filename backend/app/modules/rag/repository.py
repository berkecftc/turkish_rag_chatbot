"""RAG persistence repositories."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Sequence

from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.infrastructure.repository import TenantScopedRepository, BaseRepository
from app.modules.rag.models import Citation, Conversation, Message, MessageRole, RetrievalLog, SemanticCache


class ConversationRepository(TenantScopedRepository[Conversation]):
    model = Conversation

    async def list_active(self, *, limit: int = 50, offset: int = 0) -> Sequence[Conversation]:
        stmt = (
            select(Conversation)
            .where(
                Conversation.tenant_id == self.tenant_id,
                Conversation.is_archived.is_(False),
            )
            .order_by(Conversation.last_message_at.desc().nullslast())
            .limit(limit)
            .offset(offset)
        )
        return (await self.session.execute(stmt)).scalars().all()

    async def touch(self, conversation_id: uuid.UUID) -> None:
        await self.session.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(
                last_message_at=datetime.now(timezone.utc).replace(tzinfo=None),
                total_messages=Conversation.total_messages + 1,
            )
        )

    async def add_tokens(self, conversation_id: uuid.UUID, tokens: int) -> None:
        await self.session.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(total_tokens_used=Conversation.total_tokens_used + tokens)
        )


class MessageRepository(TenantScopedRepository[Message]):
    model = Message

    async def recent_in_conversation(
        self, conversation_id: uuid.UUID, *, limit: int = 20
    ) -> Sequence[Message]:
        stmt = (
            select(Message)
            .where(
                Message.tenant_id == self.tenant_id,
                Message.conversation_id == conversation_id,
            )
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        return list(reversed(rows))

    async def get_with_citations(self, message_id: uuid.UUID) -> Message | None:
        stmt = (
            select(Message)
            .where(Message.id == message_id, Message.tenant_id == self.tenant_id)
            .options(selectinload(Message.citations))
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()


class CitationRepository(TenantScopedRepository[Citation]):
    model = Citation

    async def for_message(self, message_id: uuid.UUID) -> Sequence[Citation]:
        stmt = (
            select(Citation)
            .where(Citation.tenant_id == self.tenant_id, Citation.message_id == message_id)
            .order_by(Citation.citation_number)
        )
        return (await self.session.execute(stmt)).scalars().all()


class RetrievalLogRepository(TenantScopedRepository[RetrievalLog]):
    model = RetrievalLog

    async def for_message(self, message_id: uuid.UUID) -> RetrievalLog | None:
        stmt = select(RetrievalLog).where(
            RetrievalLog.tenant_id == self.tenant_id,
            RetrievalLog.message_id == message_id,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()


class SemanticCacheRepository(TenantScopedRepository[SemanticCache]):
    model = SemanticCache

    async def find_similar(
        self,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        query_embedding: list[float],
        threshold: float,
    ) -> SemanticCache | None:
        from sqlalchemy import text

        stmt = text(
            """
            SELECT id FROM semantic_cache
            WHERE tenant_id = :tid
              AND user_id = :uid
              AND expires_at > now()
              AND 1 - (query_embedding <=> CAST(:emb AS vector)) >= :thresh
            ORDER BY query_embedding <=> CAST(:emb AS vector)
            LIMIT 1
            """
        )
        import json

        result = await self.session.execute(
            stmt,
            {
                "tid": str(tenant_id),
                "uid": str(user_id),
                "emb": json.dumps(query_embedding),
                "thresh": threshold,
            },
        )
        row = result.fetchone()
        if row is None:
            return None
        return await self.session.get(SemanticCache, row[0])

    async def increment_hit(self, cache_id: uuid.UUID) -> None:
        await self.session.execute(
            update(SemanticCache)
            .where(SemanticCache.id == cache_id)
            .values(hit_count=SemanticCache.hit_count + 1)
        )
