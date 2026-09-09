"""BGE-M3 dense embedder — implements the Embedder domain port.

Singleton model load (lazy), thread-safe via asyncio.to_thread.
Used by both the ingestion pipeline and the RAG query encoder.
"""
from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.ports import Embedding

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

log = get_logger("ai.embedder")
_model: SentenceTransformer | None = None
_lock = asyncio.Lock()


def _load_model(model_name: str) -> SentenceTransformer:
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        log.info("embedder.loading", model=model_name)
        _model = SentenceTransformer(model_name)
        log.info("embedder.ready", model=model_name)
    return _model


class BgeM3Embedder:
    """Implements domain Embedder port using BAAI/bge-m3."""

    def __init__(self) -> None:
        cfg = get_settings()
        self._model_name = cfg.embedding_model
        self._batch_size = cfg.embed_batch_size

    def _model(self):
        return _load_model(self._model_name)

    def _encode_sync(self, texts: list[str]) -> list[list[float]]:
        model = self._model()
        vecs = model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
            batch_size=self._batch_size,
        )
        return [v.tolist() for v in vecs]

    async def embed_documents(self, texts: list[str]) -> list[Embedding]:
        vecs = await asyncio.to_thread(self._encode_sync, texts)
        return [Embedding(dense=v) for v in vecs]

    async def embed_query(self, text: str) -> Embedding:
        results = await self.embed_documents([text])
        return results[0]
