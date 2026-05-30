"""PaddleOCR adapter. Handles scanned PDFs and images. Converts PDF pages to
images at the configured DPI, then runs OCR on sparse pages only."""
from __future__ import annotations

import io
import uuid

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.ports import TextBlock
from app.workers.pipeline import IngestionContext, Stage

log = get_logger("ocr.paddle")


class PaddleOcrStage:
    name = "ocr"

    def __init__(self) -> None:
        self._settings = get_settings()
        self._ocr = None  # lazy init — model load is expensive

    def _get_ocr(self):
        if self._ocr is None:
            from paddleocr import PaddleOCR

            self._ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
        return self._ocr

    async def run(self, ctx: IngestionContext) -> IngestionContext:
        sparse_pages: list[int] = ctx.metadata.get("sparse_pages", [])

        # Images always need OCR; PDFs only on sparse pages.
        needs_ocr = ctx.mime_type.startswith("image/") or bool(sparse_pages)
        if not needs_ocr:
            return ctx

        ocr_blocks = await self._ocr_file(ctx, sparse_pages)
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
        images = convert_from_bytes(pdf_bytes, dpi=self._settings.ocr_dpi, first_page=min(pages), last_page=max(pages))

        for img, page_num in zip(images, range(min(pages), max(pages) + 1)):
            if page_num not in pages:
                continue
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            page_blocks = self._run_ocr_bytes(buf.getvalue(), page=page_num)
            blocks.extend(page_blocks)

        return blocks

    def _run_ocr_bytes(self, img_bytes: bytes, page: int) -> list[TextBlock]:
        import numpy as np
        from PIL import Image

        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        arr = np.array(img)
        result = self._get_ocr().ocr(arr, cls=True)

        blocks: list[TextBlock] = []
        for line_group in (result or []):
            for item in (line_group or []):
                bbox_raw, (text, conf) = item
                if text and text.strip():
                    blocks.append(TextBlock(text=text.strip(), page=page, confidence=float(conf)))

        return blocks
