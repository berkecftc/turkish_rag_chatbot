"""PDF text extraction stage. Uses pypdf for native text; flags pages for OCR
when the char-per-page density is below the configured threshold."""
from __future__ import annotations

import io

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.ports import TextBlock
from app.workers.pipeline import IngestionContext, Stage

log = get_logger("extractor.pdf")


class PdfExtractorStage:
    name = "extract"

    def __init__(self) -> None:
        self._threshold = get_settings().ocr_necessity_char_threshold

    async def run(self, ctx: IngestionContext) -> IngestionContext:
        try:
            import pypdf
        except ImportError as exc:
            raise RuntimeError("pypdf not installed") from exc

        reader = pypdf.PdfReader(io.BytesIO(ctx.file_bytes))
        blocks: list[TextBlock] = []
        sparse_pages: list[int] = []

        for page_num, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            if len(text.strip()) < self._threshold:
                sparse_pages.append(page_num)
            else:
                blocks.append(TextBlock(text=text, page=page_num))

        ctx.blocks = blocks
        ctx.metadata["sparse_pages"] = sparse_pages
        ctx.metadata["page_count"] = len(reader.pages)
        log.info("pdf.extracted", document_id=ctx.document_id, pages=len(reader.pages), sparse=len(sparse_pages))
        return ctx
