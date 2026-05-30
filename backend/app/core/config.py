"""Typed, validated application settings. Fail fast on boot if misconfigured."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "test", "staging", "production"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ── App ──────────────────────────────────────────────────────────────
    app_env: Environment = "local"
    app_name: str = "turkish-rag"
    log_level: str = "INFO"
    api_v1_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    # ── Datastores ───────────────────────────────────────────────────────
    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    # ── Celery ───────────────────────────────────────────────────────────
    celery_broker_url: str
    celery_result_backend: str

    # ── Object storage ───────────────────────────────────────────────────
    storage_endpoint: str
    storage_access_key: str
    storage_secret_key: str
    storage_bucket: str = "documents"

    # ── Auth / JWT ───────────────────────────────────────────────────────
    jwt_private_key: str = ""
    jwt_public_key: str = ""
    jwt_algorithm: str = "RS256"
    jwt_access_ttl_seconds: int = 900
    jwt_refresh_ttl_seconds: int = 1_209_600

    # ── AI / RAG ─────────────────────────────────────────────────────────
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    embedding_model: str = "BAAI/bge-m3"
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    ocr_engine: Literal["paddle", "tesseract"] = "paddle"
    embedding_dim: int = 1024
    retrieval_top_k: int = 50
    rerank_top_n: int = 8

    # ── RAG pipeline ─────────────────────────────────────────────────────
    rag_context_max_tokens: int = 12000
    rag_generation_temperature: float = 0.1
    rag_generation_max_tokens: int = 2048
    rag_hybrid_vector_weight: float = 0.6
    rag_hybrid_bm25_weight: float = 0.4
    rag_rrf_k: int = 60
    rag_semantic_cache_ttl_seconds: int = 3600
    rag_cache_similarity_threshold: float = 0.95
    rag_confidence_threshold: float = 0.3
    rag_rerank_threshold: float = 0.0
    rag_memory_window_messages: int = 10
    rag_memory_max_tokens: int = 4000
    rag_hallucination_threshold: float = 0.35
    rag_injection_detection: bool = True
    rag_enable_compression: bool = True
    rag_compression_threshold_tokens: int = 10000
    rag_source_freshness_decay_days: int = 365

    # ── Rate limiting ────────────────────────────────────────────────────
    rate_limit_per_minute: int = 120
    rate_limit_rag_per_minute: int = 30

    # ── Uploads ──────────────────────────────────────────────────────────
    max_upload_mb: int = 50
    allowed_mime_types: list[str] = Field(default_factory=list)

    # ── Ingestion pipeline ───────────────────────────────────────────────
    ocr_dpi: int = 300
    ocr_necessity_char_threshold: int = 100  # chars/page below this -> OCR
    chunk_min_tokens: int = 256
    chunk_max_tokens: int = 1024
    chunk_overlap_tokens: int = 64
    embed_batch_size: int = 32
    max_archive_uncompressed_mb: int = 200
    storage_presign_expiry_seconds: int = 3600

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @field_validator("cors_origins", "allowed_mime_types", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    """Singleton settings. Cached so env is parsed once per process."""
    return Settings()  # type: ignore[call-arg]
