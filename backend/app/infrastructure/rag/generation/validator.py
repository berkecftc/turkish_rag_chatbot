"""Hallucination detection via claim-context alignment.

Strategy:
1. Split generated response into sentences (Turkish + English aware).
2. Embed each sentence asynchronously using the same BGE-M3 model.
3. For each sentence, compute cosine similarity to all retrieved chunk embeddings.
4. Sentences with max_similarity < threshold are flagged as potentially unsupported.
5. Overall confidence = mean of per-sentence max similarities.

This is a retrieval-grounded verification — we do NOT call an LLM for validation
(latency would be unacceptable for interactive use).  The embedder is already
warmed up from the query embedding step.

Limitations:
- Embedding similarity is a proxy; it misses numeric discrepancies.
- Very short sentences (< 10 chars) are skipped.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass

from app.core.config import get_settings
from app.core.logging import get_logger
from app.infrastructure.rag.retrieval.fusion import FusedResult

log = get_logger("generation.validator")

# Turkish + English sentence boundaries
_SENT_RE = re.compile(r"(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜa-zA-ZA-zÀ-ɏ\"'\(])")
_SKIP_RE = re.compile(r"^\[[\d, ]+\]$")  # skip pure citation markers


@dataclass
class ValidationResult:
    confidence: float
    hallucination_flags: list[str]
    per_sentence_scores: list[tuple[str, float]]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    n_a = math.sqrt(sum(x * x for x in a))
    n_b = math.sqrt(sum(x * x for x in b))
    if n_a == 0 or n_b == 0:
        return 0.0
    return dot / (n_a * n_b)


class HallucinationValidator:
    def __init__(self, embedder) -> None:
        self._embedder = embedder
        cfg = get_settings()
        self._threshold = cfg.rag_hallucination_threshold

    async def validate(
        self,
        response_text: str,
        retrieved_chunks: list[FusedResult],
    ) -> ValidationResult:
        if not retrieved_chunks or not response_text.strip():
            return ValidationResult(confidence=0.0, hallucination_flags=[], per_sentence_scores=[])

        # Extract chunk embeddings (pre-computed during ingestion, stored in metadata)
        chunk_embeddings = [
            c.chunk_metadata.get("embedding")
            for c in retrieved_chunks
            if c.chunk_metadata.get("embedding")
        ]

        sentences = self._split_sentences(response_text)
        if not sentences:
            return ValidationResult(confidence=1.0, hallucination_flags=[], per_sentence_scores=[])

        if not chunk_embeddings:
            # No embeddings available for chunks — compute confidence from rerank scores
            avg_score = sum(
                c.rerank_score or c.combined_score for c in retrieved_chunks
            ) / len(retrieved_chunks)
            return ValidationResult(
                confidence=min(avg_score, 1.0),
                hallucination_flags=[],
                per_sentence_scores=[],
            )

        # Embed all sentences in one batch call
        sent_embeddings = await self._embedder.embed_documents(sentences)

        per_sentence: list[tuple[str, float]] = []
        flags: list[str] = []

        for sent, emb in zip(sentences, sent_embeddings, strict=True):
            max_sim = max(_cosine(emb.dense, ce) for ce in chunk_embeddings)
            per_sentence.append((sent, max_sim))
            if max_sim < self._threshold:
                flags.append(sent[:100])

        confidence = sum(s for _, s in per_sentence) / len(per_sentence)
        confidence = min(max(confidence, 0.0), 1.0)

        log.info(
            "validator.done",
            sentences=len(sentences),
            flagged=len(flags),
            confidence=round(confidence, 3),
        )
        return ValidationResult(
            confidence=confidence,
            hallucination_flags=flags,
            per_sentence_scores=per_sentence,
        )

    @staticmethod
    def _split_sentences(text: str) -> list[str]:
        sentences = _SENT_RE.split(text)
        result = []
        for s in sentences:
            s = s.strip()
            if len(s) >= 10 and not _SKIP_RE.match(s):
                result.append(s)
        return result
