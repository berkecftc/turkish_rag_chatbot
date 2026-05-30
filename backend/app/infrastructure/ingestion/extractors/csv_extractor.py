"""CSV extraction stage. Each row becomes a TextBlock with its field values
joined as key=value pairs (preserves context for embedding)."""
from __future__ import annotations

import csv
import io

from app.core.logging import get_logger
from app.domain.ports import TextBlock
from app.workers.pipeline import IngestionContext

log = get_logger("extractor.csv")

_MAX_ROWS = 50_000


class CsvExtractorStage:
    name = "extract"

    async def run(self, ctx: IngestionContext) -> IngestionContext:
        text = ctx.file_bytes.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        blocks: list[TextBlock] = []

        for i, row in enumerate(reader):
            if i >= _MAX_ROWS:
                log.warning("csv.truncated", document_id=ctx.document_id, limit=_MAX_ROWS)
                break
            line = " | ".join(f"{k}: {v}" for k, v in row.items() if v)
            if line:
                blocks.append(TextBlock(text=line, page=None))

        ctx.blocks = blocks
        ctx.metadata["page_count"] = None
        log.info("csv.extracted", document_id=ctx.document_id, rows=len(blocks))
        return ctx
