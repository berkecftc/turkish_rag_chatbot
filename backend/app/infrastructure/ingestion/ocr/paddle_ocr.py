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

            # PaddleOCR 3.x renamed/removed several 2.x kwargs (show_log gone,
            # use_angle_cls -> use_textline_orientation). Try the modern
            # signature first, then fall back for older installs. lang="latin"
            # covers Turkish (Latin script); "ch" would mis-recognize it.
            try:
                self._ocr = PaddleOCR(use_textline_orientation=True, lang="latin")
            except (TypeError, ValueError):
                self._ocr = PaddleOCR(lang="latin")
        return self._ocr

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
        ocr = self._get_ocr()

        # PaddleOCR 3.x: predict() -> [OCRResult(dict)] with rec_texts/rec_scores.
        # 2.x: ocr(arr, cls=True) -> [[ [box, (text, conf)], ... ]]. Support both.
        if hasattr(ocr, "predict"):
            result = ocr.predict(arr)
        else:  # pragma: no cover - legacy 2.x path
            result = ocr.ocr(arr)

        blocks: list[TextBlock] = []
        for res in (result or []):
            if isinstance(res, dict) or hasattr(res, "get"):  # 3.x OCRResult
                texts = res.get("rec_texts") or []
                scores = res.get("rec_scores") or []
                for text, conf in zip(texts, scores):
                    if text and text.strip():
                        blocks.append(TextBlock(text=text.strip(), page=page, confidence=float(conf)))
            else:  # 2.x line group
                for item in (res or []):
                    bbox_raw, (text, conf) = item
                    if text and text.strip():
                        blocks.append(TextBlock(text=text.strip(), page=page, confidence=float(conf)))

        return blocks
