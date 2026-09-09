"""Prompt injection and retrieval poisoning defense.

Threat model:
1. Instruction override — user tries to override system prompt.
2. Prompt leakage — user asks to reveal system instructions.
3. Jailbreak — role-play attacks, DAN-style, persona hijacking.
4. Context injection — malicious content in uploaded documents that
   contains embedded instructions to manipulate the model.
5. Indirect injection — retrieved chunks contain adversarial instructions.

Defense layers:
- Pattern-based detection (fast, zero-latency).
- Retrieval content sanitization (strip instruction-like content from chunks).
- User query sanitization (preserve meaning, remove injection tokens).
"""
from __future__ import annotations

import re

from app.core.exceptions import PromptInjectionError
from app.core.logging import get_logger
from app.infrastructure.rag.retrieval.fusion import FusedResult

log = get_logger("security.guard")

# ── User query injection patterns ────────────────────────────────────────────

_QUERY_INJECTION_PATTERNS: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE) for p in [
        r"(?:ignore|disregard)\s+(?:all\s+|your\s+|the\s+|previous\s+|prior\s+|above\s+|system\s+)*(?:instructions?|prompt)(?:\s+above|\s+below)?",
        r"forget\s+(all\s+)?previous\s+instructions?",
        r"\byou\s+are\s+now\s+(?:DAN|jailbreak|free|uncensored|an?\s+AI\s+without)",
        r"\bpretend\s+(?:you\s+are|to\s+be)\b",
        r"\broleplay\s+as\b",
        r"\bact\s+as\s+(?:if\s+)?(?:you\s+are\s+)?(?:a|an)\s+\w+\s+(?:without|that\s+ignores)",
        r"repeat\s+(your\s+)?(system\s+)?instructions?",
        r"what\s+(?:are|were)\s+your\s+(?:system\s+)?(?:prompt|instructions?)",
        r"</?(?:system|instruction|prompt|context|assistant)>",
        r"\[INST\]|\[/INST\]|<</?SYS>>",
        r"###\s*(?:System|Human|Assistant|Context)\s*:",
        r"\{\{.*inject.*\}\}",
        r"\\n\\n###\s*New\s+instructions",
    ]
]

# ── Context/chunk injection patterns ─────────────────────────────────────────

_CONTEXT_INJECTION_PATTERNS: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE) for p in [
        r"ignore\s+(previous|above|all)\s+instructions?",
        r"assistant\s*:\s*(now|please|you\s+should)",
        r"</?(?:system|instruction|context)\s*/?>",
        r"\[INST\]|\[/INST\]|<</?SYS>>",
        r"from\s+now\s+on\s+(you\s+are|ignore|forget)",
        r"note\s+to\s+(AI|model|assistant)\s*:",
    ]
]

# Maximum length for a single query
_MAX_QUERY_LEN = 4096


class PromptSecurityGuard:
    """Two-layer defense: block high-confidence injections, sanitize context."""

    def check_query(self, query: str) -> str:
        """Validate and sanitize user query. Raises PromptInjectionError on clear attacks."""
        if len(query) > _MAX_QUERY_LEN:
            raise PromptInjectionError("Query exceeds maximum length")

        for pattern in _QUERY_INJECTION_PATTERNS:
            if pattern.search(query):
                log.warning(
                    "security.injection_detected",
                    pattern=pattern.pattern[:50],
                    query=query[:100],
                )
                raise PromptInjectionError("Potentially malicious query detected")

        return query.strip()

    def sanitize_chunks(self, chunks: list[FusedResult]) -> list[FusedResult]:
        """Strip instruction-like content from retrieved chunks."""
        cleaned: list[FusedResult] = []
        for chunk in chunks:
            content = chunk.content
            for pattern in _CONTEXT_INJECTION_PATTERNS:
                if pattern.search(content):
                    log.warning(
                        "security.context_injection",
                        chunk_id=str(chunk.chunk_id),
                        doc=chunk.document_title,
                    )
                    content = pattern.sub("[REDACTED]", content)
            if content != chunk.content:
                chunk.content = content
            cleaned.append(chunk)
        return cleaned
