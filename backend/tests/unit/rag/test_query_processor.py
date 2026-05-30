"""Unit tests — TurkishQueryProcessor."""
from __future__ import annotations

import pytest

from app.infrastructure.rag.query.processor import QueryIntent, TurkishQueryProcessor


@pytest.fixture()
def processor() -> TurkishQueryProcessor:
    return TurkishQueryProcessor()


# ── Cleaning ──────────────────────────────────────────────────────────────────

class TestCleaning:
    def test_strips_leading_trailing_whitespace(self, processor):
        result = processor.process("  hello world  ")
        assert result.sanitized == "hello world"

    def test_collapses_internal_whitespace(self, processor):
        result = processor.process("hello   world\t\ttest")
        assert result.sanitized == "hello world test"

    def test_removes_control_characters(self, processor):
        result = processor.process("hello\x00world\x1f")
        assert "\x00" not in result.sanitized
        assert "\x1f" not in result.sanitized

    def test_original_is_preserved(self, processor):
        raw = "  hello world  "
        result = processor.process(raw)
        assert result.original == raw


# ── Language detection ────────────────────────────────────────────────────────

class TestLanguageDetection:
    def test_turkish_chars_detected(self, processor):
        result = processor.process("Ğ harfi Türkçede kullanılır")
        assert result.is_turkish is True
        assert result.language == "tr"

    def test_turkish_keywords_detected(self, processor):
        result = processor.process("bu belge ve o konu hakkında")
        assert result.is_turkish is True

    def test_english_query(self, processor):
        result = processor.process("What is the quarterly revenue figure?")
        assert result.is_turkish is False
        assert result.language == "en"

    def test_mixed_detected_as_turkish(self, processor):
        result = processor.process("What is this ve nedir?")
        assert result.is_turkish is True


# ── Intent classification ─────────────────────────────────────────────────────

class TestIntentClassification:
    def test_summarization_turkish(self, processor):
        result = processor.process("Bu raporu özetle")
        assert result.intent == QueryIntent.SUMMARIZATION

    def test_summarization_english(self, processor):
        result = processor.process("Please summarize this document")
        assert result.intent == QueryIntent.SUMMARIZATION

    def test_legal_intent_turkish(self, processor):
        result = processor.process("Sözleşmedeki yükümlülükler nelerdir?")
        assert result.intent == QueryIntent.LEGAL

    def test_legal_intent_english(self, processor):
        result = processor.process("What are the contract clauses?")
        assert result.intent == QueryIntent.LEGAL

    def test_financial_intent_turkish(self, processor):
        result = processor.process("Yıllık gelir ve gider tablosu")
        assert result.intent == QueryIntent.FINANCIAL

    def test_financial_intent_english(self, processor):
        result = processor.process("What is the total revenue and cost?")
        assert result.intent == QueryIntent.FINANCIAL

    def test_comparison_intent(self, processor):
        result = processor.process("İki ürün arasındaki fark nedir?")
        assert result.intent == QueryIntent.COMPARISON

    def test_analytical_intent(self, processor):
        result = processor.process("Neden satışlar bu kadar etkilendi?")
        assert result.intent == QueryIntent.ANALYTICAL

    def test_factual_intent_for_short_queries(self, processor):
        result = processor.process("What is AI?")
        assert result.intent == QueryIntent.FACTUAL

    def test_conversational_for_long_uncategorized(self, processor):
        result = processor.process(
            "I would like to know more about the general structure of this platform"
        )
        assert result.intent == QueryIntent.CONVERSATIONAL


# ── Metadata filter extraction ────────────────────────────────────────────────

class TestFilterExtraction:
    def test_single_year_extracted(self, processor):
        result = processor.process("2023 yılında ne oldu?")
        assert result.metadata_filters.get("years") == [2023]

    def test_multiple_years_extracted(self, processor):
        result = processor.process("2022 ve 2023 yılları arasında")
        years = result.metadata_filters.get("years", [])
        assert set(years) == {2022, 2023}

    def test_no_year_gives_empty_filters(self, processor):
        result = processor.process("Genel durum nedir?")
        assert result.metadata_filters.get("years") is None

    def test_year_outside_2000s_not_extracted(self, processor):
        result = processor.process("1998 yılında çıkan yasa")
        assert result.metadata_filters.get("years") is None


# ── Tokens ────────────────────────────────────────────────────────────────────

class TestTokens:
    def test_tokens_are_lowercased_words(self, processor):
        result = processor.process("Hello World TEST")
        assert result.tokens == ["hello", "world", "test"]

    def test_empty_query_produces_empty_tokens(self, processor):
        result = processor.process("   ")
        assert result.tokens == []
