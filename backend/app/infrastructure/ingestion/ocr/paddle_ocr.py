"""OCR adapter (Tesseract). Handles scanned PDFs and images: converts PDF
pages to images at the configured DPI, then OCRs images / sparse pages.

Uses Tesseract with the Turkish model (`tesseract-ocr-tur`, shipped in the
image) via pytesseract. PaddleOCR was dropped: its inference engine
(`paddlepaddle`) isn't installed and PP-OCRv5 has no Turkish/Latin model,
whereas Tesseract handles Turkish printed text well out of the box.
"""
from __future__ import annotations

import io

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.ports import TextBlock
from app.workers.pipeline import IngestionContext

log = get_logger("ocr.tesseract")


class PaddleOcrStage:
    name = "ocr"

    def __init__(self) -> None:
        self._settings = get_settings()
        # Turkish primary + English for mixed Latin/numeric content.
        self._lang = "tur+eng"

    async def run(self, ctx: IngestionContext) -> IngestionContext:
        sparse_pages: list[int] = ctx.metadata.get("sparse_pages", [])

        # Images always need OCR; PDFs only on sparse pages.
        needs_ocr = ctx.mime_type.startswith("image/") or bool(sparse_pages)
        if not needs_ocr:
            return ctx

        # OCR is best-effort: a failure on a few scanned pages must not sink an
        # otherwise text-extractable document. Log and continue with what we have.
        try:
            ocr_blocks = await self._ocr_file(ctx, sparse_pages)
        except Exception as exc:  # noqa: BLE001
            log.warning("ocr.skipped", document_id=ctx.document_id, error=str(exc))
            return ctx

        ctx.blocks = ctx.blocks + ocr_blocks
        ctx.blocks.sort(key=lambda b: (b.page or 0))
        log.info("ocr.done", document_id=ctx.document_id, new_blocks=len(ocr_blocks))
        return ctx

    async def _ocr_file(self, ctx: IngestionContext, sparse_pages: list[int]) -> list[TextBlock]:
        import asyncio

        if ctx.mime_type.startswith("image/"):
            return await asyncio.to_thread(self._run_ocr_bytes, ctx.file_bytes, page=1)

        # PDF: render sparse pages to images via pdf2image
        return await asyncio.to_thread(self._ocr_pdf_pages, ctx.file_bytes, sparse_pages)

    def _ocr_pdf_pages(self, pdf_bytes: bytes, pages: list[int]) -> list[TextBlock]:
        try:
            from pdf2image import convert_from_bytes
        except ImportError as exc:
            raise RuntimeError("pdf2image not installed") from exc

        blocks: list[TextBlock] = []
        images = convert_from_bytes(
            pdf_bytes, dpi=self._settings.ocr_dpi, first_page=min(pages), last_page=max(pages)
        )

        for img, page_num in zip(images, range(min(pages), max(pages) + 1), strict=False):
            if page_num not in pages:
                continue
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            page_blocks = self._run_ocr_bytes(buf.getvalue(), page=page_num)
            blocks.extend(page_blocks)

        return blocks

    def _run_ocr_bytes(self, img_bytes: bytes, page: int) -> list[TextBlock]:
        import pytesseract
        from PIL import Image

        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        text = pytesseract.image_to_string(img, lang=self._lang)

        blocks: list[TextBlock] = []
        for line in text.splitlines():
            stripped = line.strip()
            if stripped:
                blocks.append(TextBlock(text=stripped, page=page, confidence=1.0))
        return blocks