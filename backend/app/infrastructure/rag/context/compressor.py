"""LLM-based context compression.

When context token count exceeds the compression threshold, this stage
distills the retrieved passages into a compact, query-focused summary
that preserves:
- All facts directly relevant to the query
- Citation anchor numbers [N] for traceability
- Numerical values, dates, names (never paraphrase them)

Trade-off: adds ~1-2 s latency but reduces generation cost and can improve
answer quality by removing noisy chunks.
"""
from __future__ import annotations

from app.core.config import get_settings
from app.core.logging import get_logger
from app.infrastructure.rag.context.packer import PackedContext

log = get_logger("context.compressor")

_COMPRESS_SYSTEM = """You are a context compression assistant for an enterprise document retrieval system.

Your task:
- Read the retrieved document passages below.
- Compress them into a concise, information-dense summary focused on the user's question.
- PRESERVE all citation references [N] — never remove or change them.
- PRESERVE all exact numbers, dates, names, and legal/financial terms verbatim.
- REMOVE redundant information, filler text, and off-topic passages.
- Target length: approximately 40% of the original.

User question: {query}

Retrieved passages:
{context}

Output ONLY the compressed context, preserving [N] markers."""


class ContextCompressor:
    def __init__(self, llm) -> None:
        self._llm = llm
        cfg = get_settings()
        self._threshold = cfg.rag_compression_threshold_tokens
        self._enabled = cfg.rag_enable_compression

    async def compress(
        self,
        ctx: PackedContext,
        query: str,
    ) -> PackedContext:
        if not self._enabled:
            return ctx
        if ctx.token_count <= self._threshold:
            return ctx

        log.info("compressor.compressing", tokens=ctx.token_count, query=query[:80])
        try:
            prompt = _COMPRESS_SYSTEM.format(query=query, context=ctx.formatted)
            compressed_text = await self._llm.generate(
                system="",
                messages=[{"role": "user", "content": prompt}],
            )
            compressed_tokens = max(1, len(compressed_text) // 4)
            log.info("compressor.done", original=ctx.token_count, compressed=compressed_tokens)

            return PackedContext(
                formatted=compressed_text,
                chunks=ctx.chunks,
                token_count=compressed_tokens,
                was_truncated=True,
                citation_map=ctx.citation_map,
            )
        except Exception as exc:
            log.warning("compressor.failed", error=str(exc))
            return ctx
