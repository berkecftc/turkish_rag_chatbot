"""Unit tests for document parsers (PDF, DOCX, and CSV)."""
from __future__ import annotations

import io
import uuid
import pytest
from unittest.mock import MagicMock, patch

from app.workers.pipeline import IngestionContext
from app.infrastructure.ingestion.extractors.pdf_extractor import PdfExtractorStage
from app.infrastructure.ingestion.extractors.docx_extractor import DocxExtractorStage
from app.infrastructure.ingestion.extractors.csv_extractor import CsvExtractorStage


@pytest.fixture()
def context_factory():
    def _create(file_bytes: bytes, mime_type: str) -> IngestionContext:
        return IngestionContext(
            document_id=str(uuid.uuid4()),
            tenant_id=str(uuid.uuid4()),
            file_bytes=file_bytes,
            mime_type=mime_type,
        )
    return _create


class TestPdfExtractorStage:
    @pytest.mark.asyncio
    async def test_pdf_extract_native_text(self, context_factory):
        """Test happy-path PDF parsing with native text above threshold."""
        pdf_bytes = b"%PDF-1.4 mock content"
        ctx = context_factory(pdf_bytes, "application/pdf")

        # Mock pypdf reader and page behavior
        mock_page = MagicMock()
        mock_page.extract_text.return_value = "Bu, Türkçe bir yasal metindir. Kiracının hakları saklıdır."
        
        mock_reader = MagicMock()
        mock_reader.pages = [mock_page]

        with patch("pypdf.PdfReader", return_value=mock_reader):
            stage = PdfExtractorStage()
            # Set high threshold to force sparse, or low to force native
            stage._threshold = 10 
            res = await stage.run(ctx)
            
            assert len(res.blocks) == 1
            assert res.blocks[0].text == "Bu, Türkçe bir yasal metindir. Kiracının hakları saklıdır."
            assert res.blocks[0].page == 1
            assert len(res.metadata.get("sparse_pages", [])) == 0

    @pytest.mark.asyncio
    async def test_pdf_extract_sparse_page_triggers_ocr_flag(self, context_factory):
        """Test that page is flagged as sparse if character count is below threshold."""
        pdf_bytes = b"%PDF-1.4 mock sparse content"
        ctx = context_factory(pdf_bytes, "application/pdf")

        mock_page = MagicMock()
        mock_page.extract_text.return_value = "Short"  # 5 characters, below default threshold (e.g. 50)
        mock_reader = MagicMock()
        mock_reader.pages = [mock_page]

        with patch("pypdf.PdfReader", return_value=mock_reader):
            stage = PdfExtractorStage()
            stage._threshold = 50
            res = await stage.run(ctx)
            
            assert len(res.blocks) == 0
            assert res.metadata["sparse_pages"] == [1]
            assert res.metadata["page_count"] == 1


class TestDocxExtractorStage:
    @pytest.mark.asyncio
    async def test_docx_extract_paragraphs_and_headings(self, context_factory):
        """Test DOCX parsing, mapping Heading styles to section attributes."""
        docx_bytes = b"mock zip docx structure"
        ctx = context_factory(docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

        # Create paragraph mocks with styles
        p1 = MagicMock()
        p1.text = "GİRİŞ"
        p1.style.name = "Heading 1"

        p2 = MagicMock()
        p2.text = "Kira bedeli her ay ödenir."
        p2.style.name = "Normal"

        mock_doc = MagicMock()
        mock_doc.paragraphs = [p1, p2]

        with patch("docx.Document", return_value=mock_doc):
            stage = DocxExtractorStage()
            res = await stage.run(ctx)
            
            assert len(res.blocks) == 2
            assert res.blocks[0].text == "GİRİŞ"
            assert res.blocks[0].bbox == {"section": "GİRİŞ"}
            
            assert res.blocks[1].text == "Kira bedeli her ay ödenir."
            assert res.blocks[1].bbox == {"section": "GİRİŞ"}  # inherited from heading

    @pytest.mark.asyncio
    async def test_docx_missing_dependency(self, context_factory):
        """Verify error handling if python-docx package is not installed."""
        ctx = context_factory(b"bytes", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        with patch("builtins.__import__", side_effect=ImportError("docx not found")):
            stage = DocxExtractorStage()
            with pytest.raises(RuntimeError, match="python-docx not installed"):
                await stage.run(ctx)


class TestCsvExtractorStage:
    @pytest.mark.asyncio
    async def test_csv_extract_valid(self, context_factory):
        """Verify CSV row serialization to key-value string blocks."""
        csv_content = "ad,soyad,rol\nAhmet,Yılmaz,Yönetici\nMehmet,Kaya,Müşteri\n"
        # utf-8-sig encoded
        csv_bytes = csv_content.encode("utf-8-sig")
        ctx = context_factory(csv_bytes, "text/csv")

        stage = CsvExtractorStage()
        res = await stage.run(ctx)

        assert len(res.blocks) == 2
        assert res.blocks[0].text == "ad: Ahmet | soyad: Yılmaz | rol: Yönetici"
        assert res.blocks[1].text == "ad: Mehmet | soyad: Kaya | rol: Müşteri"
        assert res.metadata["page_count"] is None

    @pytest.mark.asyncio
    async def test_csv_truncation_limits(self, context_factory):
        """Ensure parser truncates rows exceeding max allowance."""
        csv_rows = ["header1,header2"]
        for i in range(105):
            csv_rows.append(f"val{i},other{i}")
        csv_bytes = "\n".join(csv_rows).encode("utf-8")
        ctx = context_factory(csv_bytes, "text/csv")

        stage = CsvExtractorStage()
        with patch("app.infrastructure.ingestion.extractors.csv_extractor._MAX_ROWS", 100):
            res = await stage.run(ctx)
            assert len(res.blocks) == 100
            assert res.blocks[-1].text == "header1: val99 | header2: other99"
