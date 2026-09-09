"""LLM-based query rewriting and expansion.

Strategies applied per intent:
- FACTUAL: Fix typos, clarify pronouns, add missing context from conversation history.
- LEGAL / FINANCIAL: Expand with formal terminology, preserve precision.
- SUMMARIZATION: Extract document scope.
- ANALYTICAL / COMPARISON: Decompose into sub-questions for multi-hop retrieval.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from app.core.logging import get_logger
from app.infrastructure.rag.query.processor import ProcessedQuery, QueryIntent

log = get_logger("query.rewriter")

_REWRITE_SYSTEM = """\
You are a query optimization expert for a Turkish enterprise document retrieval system.
Your task is to rewrite and expand user queries to maximize retrieval quality.

RULES:
1. Preserve the original intent and language (Turkish or English).
2. Fix typos and grammatical errors.
3. Replace pronouns with explicit references using conversation history.
4. Add synonyms and related terms to improve recall.
5. For complex queries, generate 2-3 sub-questions.
6. Keep rewrites concise and precise.
7. NEVER add information not implied by the original query.

OUTPUT FORMAT (JSON only, no markdown):
{
  "rewritten": "<main rewritten query>",
  "sub_questions": ["<sub question 1>", "<sub question 2>"],
  "search_terms": ["<key term 1>", "<key term 2>", "<key term 3>"]
}"""


@dataclass
class RewriteResult:
    rewritten: str
    sub_questions: list[str] = field(default_factory=list)
    search_terms: list[str] = field(default_factory=list)


class QueryRewriter:
    def __init__(self, llm) -> None:
        self._llm = llm

    async def rewrite(
        self,
        query: ProcessedQuery,
        conversation_history: list[dict] | None = None,
    ) -> RewriteResult:
        if query.intent == QueryIntent.CONVERSATIONAL and len(query.tokens) <= 5:
            # Simple conversational queries don't need rewriting.
            return RewriteResult(rewritten=query.sanitized)

        history_snippet = self._format_history(conversation_history or [])
        user_msg = self._build_user_message(query, history_snippet)

        try:
            raw = await self._llm.generate(
                system=_REWRITE_SYSTEM,
                messages=[{"role": "user", "content": user_msg}],
            )
            return self._parse(raw, fallback=query.sanitized)
        except Exception as exc:
            log.warning("rewriter.failed", error=str(exc), query=query.sanitized[:100])
            return RewriteResult(rewritten=query.sanitized)

    @staticmethod
    def _build_user_message(query: ProcessedQuery, history: str) -> str:
        parts = [f"Original query: {query.sanitized}"]
        if history:
            parts.append(f"Recent conversation:\n{history}")
        parts.append(f"Query intent: {query.intent}")
        parts.append(f"Language: {query.language}")
        return "\n\n".join(parts)

    @staticmethod
    def _format_history(history: list[dict]) -> str:
        if not history:
            return ""
        lines = []
        for msg in history[-4:]:  # last 2 turns
            role = msg.get("role", "user")
            content = str(msg.get("content", ""))[:200]
            lines.append(f"{role}: {content}")
        return "\n".join(lines)

    @staticmethod
    def _parse(raw: str, fallback: str) -> RewriteResult:
        # Strip potential markdown code fences
        cleaned = re.sub(r"```(?:json)?|```", "", raw).strip()
        try:
            data = json.loads(cleaned)
            return RewriteResult(
                rewritten=data.get("rewritten") or fallback,
                sub_questions=data.get("sub_questions") or [],
                search_terms=data.get("search_terms") or [],
            )
        except (json.JSONDecodeError, KeyError):
            return RewriteResult(rewritten=fallback)
