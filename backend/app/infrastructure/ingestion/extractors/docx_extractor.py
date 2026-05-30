"""DOCX extraction stage using python-docx. Preserves heading structure as
section metadata for downstream chunking."""
from __future__ import annotations

import io

from app.core.logging import get_logger
from app.domain.ports import TextBlock
from app.workers.pipeline import IngestionContext

log = get_logger("extractor.docx")


class DocxExtractorStage:
    name = "extract"

    async def run(self, ctx: IngestionContext) -> IngestionContext:
        try:
            import docx
        except ImportError as exc:
            raise RuntimeError("python-docx not installed") from exc

        doc = docx.Document(io.BytesIO(ctx.file_bytes))
        blocks: list[TextBlock] = []
        current_section: str | None = None

        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            if para.style.name.startswith("Heading"):
                current_section = text
            blocks.append(TextBlock(text=text, page=None, bbox={"section": current_section}))

        ctx.blocks = blocks
        ctx.metadata["page_count"] = None
        log.info("docx.extracted", document_id=ctx.document_id, blocks=len(blocks))
        return ctx
