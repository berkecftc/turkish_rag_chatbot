"""Source reliability scoring.

Factors:
1. Document freshness — newer documents score higher.
   score = exp(-age_days / decay_days), decay_days from config (default 365).

2. Citation frequency — documents cited more often in past messages
   are considered more authoritative (tracked via Citation table).

3. Intra-document semantic consistency — average pairwise similarity
   of the document's chunks. Coherent documents score higher than
   noisy / OCR-heavy ones. (Expensive to compute; cached in doc metadata.)

Scoring is done per FusedResult and the score is attached to the result
object so it can be stored in citations and used in ConfidenceScorer.
"""
from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger("reliability.scorer")


def _freshness_score(doc_updated_at: str, decay_days: int) -> float:
    try:
        updated = datetime.fromisoformat(doc_updated_at.replace("Z", "+00:00"))
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=UTC)
        age_days = (datetime.now(UTC) - updated).days
        return math.exp(-age_days / decay_days)
    except (ValueError, TypeError, AttributeError):
        return 0.5  # unknown freshness


class SourceReliabilityScorer:
    def __init__(self) -> None:
        cfg = get_settings()
        self._decay_days = cfg.rag_source_freshness_decay_days
        # Citation frequency cache: doc_id -> count (populated from DB at request time)
        self._citation_freq: dict[uuid.UUID, int] = {}
        self._max_citation_count: int = 1  # normalizer

    def set_citation_frequencies(self, frequencies: dict[uuid.UUID, int]) -> None:
        self._citation_freq = frequencies
        self._max_citation_count = max(frequencies.values(), default=1)

    def score_chunk(self, doc_updated_at: str, document_id: uuid.UUID) -> float:
        freshness = _freshness_score(doc_updated_at, self._decay_days)
        citations = self._citation_freq.get(document_id, 0)
        citation_score = citations / self._max_citation_count if self._max_citation_count > 0 else 0

        # Weighted composite: freshness dominant for enterprise data
        reliability = 0.60 * freshness + 0.40 * citation_score
        return round(min(max(reliability, 0.0), 1.0), 4)

    def annotate(self, chunks) -> None:
        """Mutate FusedResult.source_reliability in place."""
        for chunk in chunks:
            chunk.source_reliability = self.score_chunk(
                chunk.doc_updated_at, chunk.document_id
            )
