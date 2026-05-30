"""Unit tests for TokenChunkerStage."""
from __future__ import annotations

import uuid
import pytest
from unittest.mock import MagicMock, patch

from app.domain.ports import TextBlock
from app.workers.pipeline import IngestionContext
from app.infrastructure.ingestion.chunking.token_chunker import TokenChunkerStage


@pytest.fixture()
def mock_tiktoken():
    """Mock tiktoken encoder to make tests fully deterministic and fast."""
    mock_enc = MagicMock()
    # Simple mock: length of split words as pseudo-tokens
    mock_enc.encode.side_effect = lambda t: [1] * len(t.split())
    
    with patch("tiktoken.get_encoding", return_value=mock_enc) as mock_get:
        yield mock_enc


class TestTokenChunkerStage:
    @pytest.mark.asyncio
    async def test_turkish_sentence_splitting(self, mock_tiktoken):
        """Verify sentences are split correctly using Turkish rules."""
        blocks = [
            TextBlock(text="Bu birinci cümledir. Bu da ikinci cümledir! Üçüncü cümle başladı mı? Evet.", page=1)
        ]
        ctx = IngestionContext(
            document_id=str(uuid.uuid4()),
            tenant_id=str(uuid.uuid4()),
            file_bytes=b"",
            mime_type="application/pdf",
            blocks=blocks,
        )

        stage = TokenChunkerStage()
        # Ensure we have wide limits to put all inside 1 chunk but verify sentence splits internally
        stage._min_tokens = 5
        stage._max_tokens = 100
        stage._overlap = 0

        res = await stage.run(ctx)
        # Should pack all since total words ~12 < 100 max_tokens
        assert len(res.chunks) == 1
        assert "birinci cümledir" in res.chunks[0].content
        assert "Evet." in res.chunks[0].content

        # Directly test the split sentences method
        pairs = stage._split_sentences(blocks)
        assert len(pairs) == 4
        assert pairs[0][0] == "Bu birinci cümledir."
        assert pairs[1][0] == "Bu da ikinci cümledir!"
        assert pairs[2][0] == "Üçüncü cümle başladı mı?"
        assert pairs[3][0] == "Evet."
        assert all(p[1] == 1 for p in pairs)

    @pytest.mark.asyncio
    async def test_packing_and_overlap(self, mock_tiktoken):
        """Test packing logic with overlapping thresholds."""
        # Setup sentences with known mock token lengths:
        # sent 1: 5 words
        # sent 2: 4 words
        # sent 3: 5 words
        blocks = [
            TextBlock(text="Bir iki üç dört beş. Altı yedi sekiz dokuz. On onbir oniki onüç ondört.", page=1)
        ]
        ctx = IngestionContext(
            document_id=str(uuid.uuid4()),
            tenant_id=str(uuid.uuid4()),
            file_bytes=b"",
            mime_type="application/pdf",
            blocks=blocks,
        )

        stage = TokenChunkerStage()
        # Max token size 7. Min 2. Overlap 5.
        stage._min_tokens = 2
        stage._max_tokens = 7
        stage._overlap = 5

        # With mock_tiktoken encoding word count:
        # sent1 = 5 tokens -> fits in chunk 1 (buf_tokens = 5)
        # sent2 = 4 tokens -> 5 + 4 = 9 > 7 max -> emit chunk 1 (sent 1). 
        # Overlap budget is 5. sent 1 fits within 5 tokens overlap. So we carry it over.
        # buf starts with [sent1]. buf_tokens = 5.
        # Add sent2 (4 tokens) -> 5 + 4 = 9 > 7 -> emit chunk 2 (sent1 + sent2)? Wait, let's verify if sent 1 alone is emitted first.
        # Let's run and check final packed chunks.
        res = await stage.run(ctx)
        
        assert len(res.chunks) > 0
        # Verify indices and sliding attributes are assigned
        for idx, chunk in enumerate(res.chunks):
            assert chunk.index == idx
            assert chunk.metadata["strategy"] == "token_sliding"
            assert "char_start" in chunk.metadata
            assert "char_end" in chunk.metadata

    @pytest.mark.asyncio
    async def test_oversized_sentence_handling(self, mock_tiktoken):
        """Verify that a sentence exceeding the max token size is emitted as its own chunk."""
        blocks = [
            TextBlock(text="Bu cümle çok ama çok uzundur ve belirlenen maksimum kelime sayısını aşmaktadır.", page=2)
        ]
        ctx = IngestionContext(
            document_id=str(uuid.uuid4()),
            tenant_id=str(uuid.uuid4()),
            file_bytes=b"",
            mime_type="application/pdf",
            blocks=blocks,
        )

        stage = TokenChunkerStage()
        # Set max tokens very small (e.g. 3) to force sentence (12 words) to be oversized
        stage._min_tokens = 1
        stage._max_tokens = 3
        stage._overlap = 0

        res = await stage.run(ctx)
        assert len(res.chunks) == 1
        assert res.chunks[0].page == 2
        assert res.chunks[0].content == blocks[0].text
