"""Unit tests for PaddleOcrStage."""
from __future__ import annotations

import io
import uuid
import pytest
from unittest.mock import MagicMock, patch
from PIL import Image

import sys
from unittest.mock import MagicMock
mock_pdf2image = MagicMock()
sys.modules["pdf2image"] = mock_pdf2image

from app.domain.ports import TextBlock
from app.workers.pipeline import IngestionContext
from app.infrastructure.ingestion.ocr.paddle_ocr import PaddleOcrStage


@pytest.fixture()
def mock_pil_image():
    """Create a dummy 1x1 white PIL Image for OCR testing."""
    img = Image.new("RGB", (1, 1), color="white")
    return img


class TestPaddleOcrStage:
    @pytest.mark.asyncio
    async def test_ocr_not_needed_for_normal_pdf(self):
        """Verify OCR is bypassed if no sparse pages are found."""
        ctx = IngestionContext(
            document_id=str(uuid.uuid4()),
            tenant_id=str(uuid.uuid4()),
            file_bytes=b"pdf content",
            mime_type="application/pdf",
            blocks=[TextBlock(text="Native text already here", page=1)],
            metadata={"sparse_pages": []}  # empty list: no OCR needed
        )

        stage = PaddleOcrStage()
        # Mock get_ocr just to be safe
        stage._get_ocr = MagicMock()

        res = await stage.run(ctx)
        assert len(res.blocks) == 1
        assert res.blocks[0].text == "Native text already here"
        stage._get_ocr.assert_not_called()

    @pytest.mark.asyncio
    async def test_ocr_run_on_image(self, mock_pil_image):
        """Verify OCR parses image mime types directly."""
        # Convert image to bytes
        img_buf = io.BytesIO()
        mock_pil_image.save(img_buf, format="PNG")
        img_bytes = img_buf.getvalue()

        ctx = IngestionContext(
            document_id=str(uuid.uuid4()),
            tenant_id=str(uuid.uuid4()),
            file_bytes=img_bytes,
            mime_type="image/png",
            blocks=[]
        )

        stage = PaddleOcrStage()
        
        # Mock the paddleocr engine's ocr method
        mock_engine = MagicMock()
        # Shape: [[[bbox, (text, confidence)]]]
        mock_engine.ocr.return_value = [
            [
                [[[0, 0], [10, 0], [10, 10], [0, 10]], ("OCR Sonucu Metin", 0.98)]
            ]
        ]
        stage._ocr = mock_engine

        res = await stage.run(ctx)
        
        assert len(res.blocks) == 1
        assert res.blocks[0].text == "OCR Sonucu Metin"
        assert res.blocks[0].confidence == 0.98
        assert res.blocks[0].page == 1

    @pytest.mark.asyncio
    async def test_ocr_run_on_pdf_sparse_pages(self, mock_pil_image):
        """Verify OCR renders and runs only on sparse pages in a PDF."""
        ctx = IngestionContext(
            document_id=str(uuid.uuid4()),
            tenant_id=str(uuid.uuid4()),
            file_bytes=b"pdf binary content",
            mime_type="application/pdf",
            blocks=[TextBlock(text="Native page 1 text", page=1)],
            metadata={"sparse_pages": [2]}  # Page 2 needs OCR
        )

        stage = PaddleOcrStage()
        
        mock_engine = MagicMock()
        mock_engine.ocr.return_value = [
            [
                [[[0, 0], [5, 0], [5, 5], [0, 5]], ("Taranmış sayfa 2 metni", 0.91)]
            ]
        ]
        stage._ocr = mock_engine

        # Configure mock return value for convert_from_bytes
        mock_pdf2image.convert_from_bytes.return_value = [mock_pil_image]
        
        res = await stage.run(ctx)
        
        # Should have native page 1 + OCR page 2, sorted by page
        assert len(res.blocks) == 2
        assert res.blocks[0].page == 1
        assert res.blocks[0].text == "Native page 1 text"
        assert res.blocks[1].page == 2
        assert res.blocks[1].text == "Taranmış sayfa 2 metni"
        assert res.blocks[1].confidence == 0.91
        
        # Verify convert_from_bytes was called with correct range
        mock_pdf2image.convert_from_bytes.assert_called_once_with(
            ctx.file_bytes,
            dpi=stage._settings.ocr_dpi,
            first_page=2,
            last_page=2
        )
