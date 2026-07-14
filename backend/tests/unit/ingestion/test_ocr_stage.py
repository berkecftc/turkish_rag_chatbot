"""Unit tests for PaddleOcrStage (Tesseract-backed OCR stage).

The stage's real external dependencies are `pytesseract.image_to_string`
and `pdf2image.convert_from_bytes`; both are patched here so the tests are
hermetic — they pass whether or not the tesseract binary is installed.
"""
from __future__ import annotations

import io
import uuid
from unittest.mock import patch

import pytest
from PIL import Image

from app.domain.ports import TextBlock
from app.workers.pipeline import IngestionContext
from app.infrastructure.ingestion.ocr.paddle_ocr import PaddleOcrStage


@pytest.fixture()
def mock_pil_image():
    """Create a dummy 1x1 white PIL Image for OCR testing."""
    return Image.new("RGB", (1, 1), color="white")


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
            metadata={"sparse_pages": []},  # empty list: no OCR needed
        )

        stage = PaddleOcrStage()

        with patch("pytesseract.image_to_string") as mock_ocr:
            res = await stage.run(ctx)

        mock_ocr.assert_not_called()
        assert len(res.blocks) == 1
        assert res.blocks[0].text == "Native text already here"

    @pytest.mark.asyncio
    async def test_ocr_run_on_image(self, mock_pil_image):
        """Verify OCR parses image mime types directly."""
        img_buf = io.BytesIO()
        mock_pil_image.save(img_buf, format="PNG")
        img_bytes = img_buf.getvalue()

        ctx = IngestionContext(
            document_id=str(uuid.uuid4()),
            tenant_id=str(uuid.uuid4()),
            file_bytes=img_bytes,
            mime_type="image/png",
            blocks=[],
        )

        stage = PaddleOcrStage()

        with patch(
            "pytesseract.image_to_string", return_value="OCR Sonucu Metin\n"
        ) as mock_ocr:
            res = await stage.run(ctx)

        mock_ocr.assert_called_once()
        # OCR runs with Turkish+English models.
        assert mock_ocr.call_args.kwargs["lang"] == "tur+eng"

        assert len(res.blocks) == 1
        assert res.blocks[0].text == "OCR Sonucu Metin"
        assert res.blocks[0].page == 1
        # The stage assigns a fixed confidence (image_to_string has no scores).
        assert res.blocks[0].confidence == 1.0

    @pytest.mark.asyncio
    async def test_ocr_run_on_pdf_sparse_pages(self, mock_pil_image):
        """Verify OCR renders and runs only on sparse pages in a PDF."""
        ctx = IngestionContext(
            document_id=str(uuid.uuid4()),
            tenant_id=str(uuid.uuid4()),
            file_bytes=b"pdf binary content",
            mime_type="application/pdf",
            blocks=[TextBlock(text="Native page 1 text", page=1)],
            metadata={"sparse_pages": [2]},  # Page 2 needs OCR
        )

        stage = PaddleOcrStage()

        with (
            patch(
                "pdf2image.convert_from_bytes", return_value=[mock_pil_image]
            ) as mock_convert,
            patch(
                "pytesseract.image_to_string",
                return_value="Taranmış sayfa 2 metni\n",
            ),
        ):
            res = await stage.run(ctx)

        # Only the sparse page range was rendered.
        mock_convert.assert_called_once_with(
            ctx.file_bytes,
            dpi=stage._settings.ocr_dpi,
            first_page=2,
            last_page=2,
        )

        # Native page 1 + OCR page 2, sorted by page.
        assert len(res.blocks) == 2
        assert res.blocks[0].page == 1
        assert res.blocks[0].text == "Native page 1 text"
        assert res.blocks[1].page == 2
        assert res.blocks[1].text == "Taranmış sayfa 2 metni"
        assert res.blocks[1].confidence == 1.0