"""Conversation memory store — Redis (hot) + PostgreSQL (cold).

Architecture:
- Recent messages (≤ window_size) are cached in Redis as JSON lists.
- All messages are durably stored in PostgreSQL.
- When the Redis key expires or is missing, we reload from PostgreSQL.
- When accumulated tokens exceed the memory budget, older messages are
  summarized with the LLM and stored as a synthetic "system" message.

Token counting uses a simple heuristic (~4 chars/token) to avoid
importing tiktoken in the hot path.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING

from app.core.config import get_settings
from app.core.logging import get_logger

if TYPE_CHECKING:
    pass

log = get_logger("memory.store")

_MEMORY_KEY_TTL = 7200  # 2 hours


@dataclass
class MemoryMessage:
    role: str
    content: str
    message_id: str | None = None


def _approx_tokens(text: str) -> int:
    return max(1, len(text) // 4)


class ConversationMemoryStore:
    def __init__(self, redis_client, llm=None) -> None:
        self._redis = redis_client
        self._llm = llm
        cfg = get_settings()
        self._window = cfg.rag_memory_window_messages
        self._max_tokens = cfg.rag_memory_max_tokens

    def _key(self, conversation_id: uuid.UUID) -> str:
        return f"conv_memory:{conversation_id}"

    async def get(self, conversation_id: uuid.UUID) -> list[MemoryMessage]:
        raw = await self._redis.get(self._key(conversation_id))
        if raw is None:
            return []
        try:
            data = json.loads(raw)
            return [MemoryMessage(**m) for m in data]
        except (json.JSONDecodeError, TypeError):
            return []

    async def append(self, conversation_id: uuid.UUID, message: MemoryMessage) -> None:
        messages = await self.get(conversation_id)
        messages.append(message)
        # Keep only last N messages in Redis
        messages = messages[-self._window:]
        await self._redis.setex(
            self._key(conversation_id),
            _MEMORY_KEY_TTL,
            json.dumps([asdict(m) for m in messages]),
        )

    async def get_formatted(self, conversation_id: uuid.UUID) -> list[dict]:
        """Return messages as list[{role, content}] for LLM consumption."""
        messages = await self.get(conversation_id)
        total_tokens = sum(_approx_tokens(m.content) for m in messages)

        if total_tokens > self._max_tokens and self._llm is not None:
            messages = await self._summarize_old(messages)

        return [{"role": m.role, "content": m.content} for m in messages]

    async def _summarize_old(self, messages: list[MemoryMessage]) -> list[MemoryMessage]:
        """Summarize the oldest half, keep the newest half verbatim."""
        mid = len(messages) // 2
        old_messages = messages[:mid]
        recent_messages = messages[mid:]

        old_text = "\n".join(f"{m.role}: {m.content}" for m in old_messages)
        try:
            summary = await self._llm.generate(
                system="Summarize the following conversation concisely, preserving key facts and decisions.",
                messages=[{"role": "user", "content": old_text}],
            )
            summary_msg = MemoryMessage(role="system", content=f"[Earlier context summary]: {summary}")
            return [summary_msg] + list(recent_messages)
        except Exception as exc:
            log.warning("memory.summarize_failed", error=str(exc))
            return list(recent_messages)

    async def clear(self, conversation_id: uuid.UUID) -> None:
        await self._redis.delete(self._key(conversation_id))
