"""Turkish-aware query preprocessor with intent classification.

Handles:
- Unicode normalization (NFC, Turkish character normalization)
- Query cleaning (noise removal, whitespace)
- Intent detection (factual / legal / financial / summarization / analytical / comparison)
- Metadata filter extraction (document references, date ranges)
- Language detection (Turkish vs English)
"""
from __future__ import annotations

import enum
import re
import unicodedata
from dataclasses import dataclass, field

from app.core.logging import get_logger

log = get_logger("query.processor")

# ── Intent taxonomy ──────────────────────────────────────────────────────────

class QueryIntent(enum.StrEnum):
    FACTUAL = "factual"
    LEGAL = "legal"
    FINANCIAL = "financial"
    SUMMARIZATION = "summarization"
    ANALYTICAL = "analytical"
    COMPARISON = "comparison"
    CONVERSATIONAL = "conversational"


# ── Pattern-based intent signals ────────────────────────────────────────────

_INTENT_PATTERNS: list[tuple[QueryIntent, list[str]]] = [
    (QueryIntent.SUMMARIZATION, [
        r"\b(özetle\w*|özet\w*|summarize|summary|tldr|tl;dr|kısaca\s+anlat\w*|genel\s+bakış\w*)\b",
    ]),
    (QueryIntent.LEGAL, [
        r"\b(sözleşme\w*|kontrat\w*|madde\w*|hüküm\w*|yönetmelik\w*|kanun\w*|mevzuat\w*|hukuki\w*|yasal\w*|contract|clause|regulation|legal|liability|compliance)\b",
    ]),
    (QueryIntent.FINANCIAL, [
        r"\b(gelir\w*|gider\w*|bütçe\w*|maliyet\w*|fiyat\w*|ücret\w*|revenue|cost|price|budget|financial|mali\w*|finansal\w*|kar\w*|zarar\w*|profit|loss)\b",
    ]),
    (QueryIntent.COMPARISON, [
        r"\b(fark\w*|karşılaştır\w*|hangisi\w*|versus|vs\.?|compare|difference|arasındaki|ile\s+arasında)\b",
    ]),
    (QueryIntent.ANALYTICAL, [
        r"\b(analiz\w*|değerlendir\w*|neden|nasıl\s+etkiledi|analyze|evaluate|impact|effect|cause|reason|why|how\s+does)\b",
    ]),
]

_TURKISH_CHARS = re.compile(r"[çğıöşüÇĞİÖŞÜ]")
_TURKISH_KEYWORDS = re.compile(
    r"\b(ve|veya|ile|bir|bu|şu|o|için|olan|olan|gibi|ise|de|da|ki|mi|mı|mu|mü)\b", re.IGNORECASE
)

_NOISE = re.compile(r"\s+")
_CTRL = re.compile(r"[\x00-\x1f\x7f]")


@dataclass
class ProcessedQuery:
    original: str
    sanitized: str
    intent: QueryIntent
    is_turkish: bool
    language: str  # "tr" | "en" | "mixed"
    tokens: list[str]
    metadata_filters: dict = field(default_factory=dict)


class TurkishQueryProcessor:
    """Preprocesses and classifies incoming user queries."""

    def process(self, raw_query: str) -> ProcessedQuery:
        sanitized = self._clean(raw_query)
        is_turkish, lang = self._detect_language(sanitized)
        intent = self._classify_intent(sanitized, is_turkish)
        filters = self._extract_filters(sanitized)
        tokens = sanitized.lower().split()

        log.debug("query.processed", intent=intent, lang=lang, length=len(sanitized))
        return ProcessedQuery(
            original=raw_query,
            sanitized=sanitized,
            intent=intent,
            is_turkish=is_turkish,
            language=lang,
            tokens=tokens,
            metadata_filters=filters,
        )

    # ── Cleaning ─────────────────────────────────────────────────────────────

    @staticmethod
    def _clean(text: str) -> str:
        text = unicodedata.normalize("NFC", text)
        text = _CTRL.sub(" ", text)
        text = _NOISE.sub(" ", text)
        return text.strip()

    # ── Language detection ────────────────────────────────────────────────────

    @staticmethod
    def _detect_language(text: str) -> tuple[bool, str]:
        has_turkish_chars = bool(_TURKISH_CHARS.search(text))
        turkish_word_count = len(_TURKISH_KEYWORDS.findall(text))

        if has_turkish_chars or turkish_word_count >= 2:
            return True, "tr"
        if turkish_word_count == 1:
            return True, "mixed"
        return False, "en"

    # ── Intent classification ─────────────────────────────────────────────────

    @staticmethod
    def _classify_intent(text: str, is_turkish: bool) -> QueryIntent:
        lower = text.lower()

        for intent, patterns in _INTENT_PATTERNS:
            for pattern in patterns:
                if re.search(pattern, lower, re.IGNORECASE):
                    return intent

        # Heuristic: short questions are usually factual
        words = lower.split()
        if len(words) <= 6:
            return QueryIntent.FACTUAL
        return QueryIntent.CONVERSATIONAL

    # ── Filter extraction ─────────────────────────────────────────────────────

    @staticmethod
    def _extract_filters(text: str) -> dict:
        """Extract implicit metadata constraints from the query text."""
        filters: dict = {}

        # Year references: "2023 yılında", "in 2023"
        years = re.findall(r"\b(20\d{2})\b", text)
        if years:
            filters["years"] = [int(y) for y in set(years)]

        return filters
