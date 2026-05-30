"""BGE-M3 dense embedder using sentence-transformers. Batches chunks to stay
within GPU/CPU memory, emits progress updates on the context."""
from __future__ import annotations

import asyncio

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.ports import Embedding
from app.workers.pipeline import IngestionContext

log = get_logger("embedder.bge")


class BgeEmbedderStage:
    name = "embed"

    def __init__(self) -> None:
        cfg = get_settings()
        self._model_name = cfg.embedding_model
        self._batch_size = cfg.embed_batch_size
        self._model = None

    def _get_model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self._model_name)
            log.info("embedder.model_loaded", model=self._model_name)
        return self._model

    async def run(self, ctx: IngestionContext) -> IngestionContext:
        if not ctx.chunks:
            return ctx

        model = self._get_model()
        texts = [c.content for c in ctx.chunks]
        embeddings = await asyncio.to_thread(self._embed_batched, model, texts)

        for chunk, emb in zip(ctx.chunks, embeddings):
            chunk.metadata["embedding"] = emb.dense

        log.info("embedder.done", document_id=ctx.document_id, chunks=len(ctx.chunks))
        return ctx

    def _embed_batched(self, model, texts: list[str]) -> list[Embedding]:
        results: list[Embedding] = []
        for i in range(0, len(texts), self._batch_size):
            batch = texts[i : i + self._batch_size]
            vecs = model.encode(batch, normalize_embeddings=True, show_progress_bar=False)
            results.extend(Embedding(dense=v.tolist()) for v in vecs)
        return results
