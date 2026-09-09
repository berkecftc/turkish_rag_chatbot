"""Token-aware sliding-window chunker with Turkish sentence boundary awareness.

Strategy:
1. Concatenate all TextBlocks into a single text stream, tracking page lineage.
2. Split into sentences using simple Turkish-aware rules.
3. Greedily pack sentences into chunks of [min, max] tokens with overlap.
"""
from __future__ import annotations

import re

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.ports import Chunk, TextBlock
from app.workers.pipeline import IngestionContext

log = get_logger("chunker")

# Turkish sentence-ending patterns: ., !, ? followed by space + uppercase or end.
_SENT_SPLIT = re.compile(r"(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜA-Z\"])")


def _count_tokens(text: str, enc) -> int:
    return len(enc.encode(text))


class TokenChunkerStage:
    name = "chunk"

    def __init__(self) -> None:
        cfg = get_settings()
        self._min_tokens = cfg.chunk_min_tokens
        self._max_tokens = cfg.chunk_max_tokens
        self._overlap = cfg.chunk_overlap_tokens
        self._enc = None

    def _encoder(self):
        if self._enc is None:
            import tiktoken

            self._enc = tiktoken.get_encoding("cl100k_base")
        return self._enc

    async def run(self, ctx: IngestionContext) -> IngestionContext:
        enc = self._encoder()
        sentences = self._split_sentences(ctx.blocks)
        chunks = self._pack_chunks(sentences, enc)
        ctx.chunks = chunks
        log.info("chunker.done", document_id=ctx.document_id, chunks=len(chunks))
        return ctx

    def _split_sentences(self, blocks: list[TextBlock]) -> list[tuple[str, int | None]]:
        """Return (sentence, page) pairs."""
        pairs: list[tuple[str, int | None]] = []
        for block in blocks:
            for sent in _SENT_SPLIT.split(block.text):
                sent = sent.strip()
                if sent:
                    pairs.append((sent, block.page))
        return pairs

    def _pack_chunks(
        self, sentences: list[tuple[str, int | None]], enc
    ) -> list[Chunk]:
        chunks: list[Chunk] = []
        buf: list[str] = []
        buf_pages: list[int | None] = []
        buf_tokens = 0
        chunk_idx = 0
        char_pos = 0

        for sent, page in sentences:
            t = _count_tokens(sent, enc)

            # Oversized single sentence: emit as its own chunk.
            if t > self._max_tokens:
                if buf:
                    chunks.append(
                        self._make_chunk(chunk_idx, buf, buf_tokens, buf_pages, enc, char_pos)
                    )
                    char_pos += sum(len(s) for s in buf)
                    chunk_idx += 1
                    buf, buf_tokens, buf_pages = [], 0, []
                chunks.append(
                    Chunk(content=sent, index=chunk_idx, token_count=t, page=page,
                          metadata={"strategy": "token_sliding"})
                )
                char_pos += len(sent)
                chunk_idx += 1
                continue

            if buf_tokens + t > self._max_tokens and buf_tokens >= self._min_tokens:
                chunks.append(
                    self._make_chunk(chunk_idx, buf, buf_tokens, buf_pages, enc, char_pos)
                )
                char_pos += sum(len(s) for s in buf)
                chunk_idx += 1
                # Overlap: keep trailing sentences that fit within overlap budget.
                overlap_buf: list[str] = []
                overlap_pages: list[int | None] = []
                overlap_tokens = 0
                for s, p in reversed(list(zip(buf, buf_pages, strict=True))):
                    st = _count_tokens(s, enc)
                    if overlap_tokens + st > self._overlap:
                        break
                    overlap_buf.insert(0, s)
                    overlap_pages.insert(0, p)
                    overlap_tokens += st
                buf, buf_pages, buf_tokens = overlap_buf, overlap_pages, overlap_tokens

            buf.append(sent)
            buf_pages.append(page)
            buf_tokens += t

        if buf:
            chunks.append(self._make_chunk(chunk_idx, buf, buf_tokens, buf_pages, enc, char_pos))

        return chunks

    @staticmethod
    def _make_chunk(
        idx: int, buf: list[str], tokens: int,
        pages: list[int | None], enc, char_start: int
    ) -> Chunk:
        content = " ".join(buf)
        page = next((p for p in pages if p is not None), None)
        return Chunk(
            content=content,
            index=idx,
            token_count=tokens,
            page=page,
            metadata={"strategy": "token_sliding", "char_start": char_start,
                      "char_end": char_start + len(content)},
        )
