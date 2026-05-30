"""Composable ingestion pipeline. Each stage is single-responsibility and
independently testable; the pipeline is just an ordered list of stages from
config. Concrete stages live in app.infrastructure (Phase 3)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.domain.ports import Chunk, TextBlock


@dataclass(slots=True)
class IngestionContext:
    """Mutable bag threaded through the pipeline for one document."""

    document_id: str
    tenant_id: str
    file_bytes: bytes
    mime_type: str
    blocks: list[TextBlock] = field(default_factory=list)
    chunks: list[Chunk] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    def progress(self) -> int:
        return self.metadata.get("progress", 0)


class Stage(Protocol):
    name: str

    async def run(self, ctx: IngestionContext) -> IngestionContext: ...


class Pipeline:
    def __init__(self, stages: list[Stage]) -> None:
        self._stages = stages

    async def run(self, ctx: IngestionContext) -> IngestionContext:
        for i, stage in enumerate(self._stages):
            ctx = await stage.run(ctx)
            ctx.metadata["progress"] = int((i + 1) / len(self._stages) * 100)
        return ctx
