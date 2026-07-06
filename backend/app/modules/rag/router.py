"""RAG API — chat, search, conversation management, and retrieval debugging.

Endpoints:
  POST /rag/chat                       — full RAG turn (non-streaming)
  POST /rag/chat/stream                — streaming SSE RAG turn
  POST /rag/search                     — retrieval-only (no generation)
  POST /rag/conversations              — create conversation
  GET  /rag/conversations              — list conversations
  PATCH /rag/conversations/{id}        — rename conversation
  GET  /rag/conversations/{id}/messages— message history with citations
  GET  /rag/debug/{message_id}         — retrieval debug inspection
"""
from __future__ import annotations

import json
import uuid
from typing import AsyncIterator

from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, get_principal
from app.core.exceptions import NotFoundError
from app.core.redis import redis_client
from app.modules.rag.repository import ConversationRepository, MessageRepository
from app.modules.rag.schemas import (
    ChatRequest,
    ChatResponse,
    ConversationCreate,
    ConversationOut,
    ConversationUpdate,
    DebugResponse,
    MessageOut,
    SearchRequest,
    SearchResponse,
)
from app.modules.rag.service import RagService

router = APIRouter(prefix="/rag", tags=["rag"])


def _svc(session: AsyncSession = Depends(get_db)) -> RagService:
    return RagService(session=session, redis_client=redis_client)


# ── Chat ──────────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    principal: Principal = Depends(get_principal),
    svc: RagService = Depends(_svc),
) -> ChatResponse:
    body.stream = False
    return await svc.chat(body, tenant_id=principal.tenant_id, user_id=principal.user_id)


@router.post("/chat/stream")
async def chat_stream(
    body: ChatRequest,
    principal: Principal = Depends(get_principal),
    svc: RagService = Depends(_svc),
) -> StreamingResponse:
    async def _sse() -> AsyncIterator[str]:
        async for event in svc.stream_chat(
            body, tenant_id=principal.tenant_id, user_id=principal.user_id
        ):
            yield f"data: {json.dumps(event, default=str)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        _sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Search (retrieval-only) ───────────────────────────────────────────────────

@router.post("/search", response_model=SearchResponse)
async def search(
    body: SearchRequest,
    principal: Principal = Depends(get_principal),
    svc: RagService = Depends(_svc),
) -> SearchResponse:
    return await svc.search(
        body, tenant_id=principal.tenant_id, user_id=principal.user_id
    )


# ── Conversations ─────────────────────────────────────────────────────────────

@router.post(
    "/conversations",
    response_model=ConversationOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation(
    body: ConversationCreate,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> ConversationOut:
    from app.modules.rag.models import Conversation

    repo = ConversationRepository(session, principal.tenant_id)
    conv = Conversation(
        tenant_id=principal.tenant_id,
        user_id=principal.user_id,
        title=body.title,
    )
    await repo.add(conv)
    await session.flush()
    return ConversationOut.model_validate(conv)


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> list[ConversationOut]:
    repo = ConversationRepository(session, principal.tenant_id)
    convs = await repo.list_active(principal.user_id, limit=limit, offset=offset)
    return [ConversationOut.model_validate(c) for c in convs]


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageOut],
)
async def get_messages(
    conversation_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> list[MessageOut]:
    conv_repo = ConversationRepository(session, principal.tenant_id)
    conv = await conv_repo.get(conversation_id)
    if conv is None or conv.tenant_id != principal.tenant_id or conv.user_id != principal.user_id:
        raise NotFoundError(f"Conversation {conversation_id} not found")
    repo = MessageRepository(session, principal.tenant_id)
    messages = await repo.recent_in_conversation(conversation_id, limit=limit)
    return [MessageOut.model_validate(m) for m in messages]


@router.patch(
    "/conversations/{conversation_id}",
    response_model=ConversationOut,
)
async def rename_conversation(
    conversation_id: uuid.UUID,
    body: ConversationUpdate,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> ConversationOut:
    repo = ConversationRepository(session, principal.tenant_id)
    conv = await repo.get(conversation_id)
    if conv is None or conv.tenant_id != principal.tenant_id or conv.user_id != principal.user_id:
        raise NotFoundError(f"Conversation {conversation_id} not found")
    conv.title = body.title.strip()
    await session.flush()
    # onupdate refreshes updated_at server-side; reload eagerly so Pydantic
    # doesn't trigger a lazy load outside the async greenlet (MissingGreenlet).
    await session.refresh(conv)
    return ConversationOut.model_validate(conv)


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_conversation(
    conversation_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a conversation. Messages/citations cascade (FK
    ondelete=CASCADE); retrieval logs are detached (SET NULL)."""
    repo = ConversationRepository(session, principal.tenant_id)
    conv = await repo.get(conversation_id)
    if conv is None or conv.tenant_id != principal.tenant_id or conv.user_id != principal.user_id:
        raise NotFoundError(f"Conversation {conversation_id} not found")
    await session.delete(conv)


# ── Debug ─────────────────────────────────────────────────────────────────────

@router.get("/debug/{message_id}", response_model=DebugResponse)
async def debug_retrieval(
    message_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    svc: RagService = Depends(_svc),
) -> DebugResponse:
    result = await svc.get_debug(message_id, principal.tenant_id)
    if result is None:
        raise NotFoundError(f"No retrieval log found for message {message_id}")
    return result
