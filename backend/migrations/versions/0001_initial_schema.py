"""Initial schema: auth + documents + ingestion tables.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-05-26
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── pgvector extension ───────────────────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # ── Enums ────────────────────────────────────────────────────────────
    document_source = postgresql.ENUM(
        "pdf", "docx", "xlsx", "csv", "image", "txt",
        name="document_source", create_type=True,
    )
    document_status = postgresql.ENUM(
        "pending", "processing", "ready", "failed", "quarantined",
        name="document_status", create_type=True,
    )
    job_status = postgresql.ENUM(
        "queued", "running", "succeeded", "failed", "retrying", "dead",
        name="job_status", create_type=True,
    )
    ingestion_stage = postgresql.ENUM(
        "queued", "extract", "ocr", "chunk", "embed", "index", "done", "error",
        name="ingestion_stage", create_type=True,
    )
    embedding_status = postgresql.ENUM(
        "pending", "embedded", "failed",
        name="embedding_status", create_type=True,
    )
    document_source.create(op.get_bind(), checkfirst=True)
    document_status.create(op.get_bind(), checkfirst=True)
    job_status.create(op.get_bind(), checkfirst=True)
    ingestion_stage.create(op.get_bind(), checkfirst=True)
    embedding_status.create(op.get_bind(), checkfirst=True)

    # ── auth: users ──────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("hashed_password", sa.String(128), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("permissions", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])

    # ── auth: refresh_tokens ─────────────────────────────────────────────
    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("jti", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_refresh_tokens_jti", "refresh_tokens", ["jti"])

    # ── documents ────────────────────────────────────────────────────────
    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("source_type", postgresql.ENUM("pdf", "docx", "xlsx", "csv", "image", "txt", name="document_source", create_type=False), nullable=False),
        sa.Column("status", postgresql.ENUM("pending", "processing", "ready", "failed", "quarantined", name="document_status", create_type=False), nullable=False, server_default="pending"),
        sa.Column("storage_key", sa.String(1024), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("mime_type", sa.String(255), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("language", sa.String(8), nullable=False, server_default="tr"),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("tenant_id", "content_hash", name="uq_documents_tenant_hash"),
    )
    op.create_index("ix_documents_tenant_id", "documents", ["tenant_id"])
    op.create_index("ix_documents_content_hash", "documents", ["content_hash"])
    op.create_index("ix_documents_status", "documents", ["status"])

    # ── document_versions ────────────────────────────────────────────────
    op.create_table(
        "document_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(1024), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("document_id", "version", name="uq_version_doc_version"),
    )
    op.create_index("ix_document_versions_document_id", "document_versions", ["document_id"])

    # ── ingestion_jobs ───────────────────────────────────────────────────
    op.create_table(
        "ingestion_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", postgresql.ENUM("queued", "running", "succeeded", "failed", "retrying", "dead", name="job_status", create_type=False), nullable=False, server_default="queued"),
        sa.Column("stage", postgresql.ENUM("queued", "extract", "ocr", "chunk", "embed", "index", "done", "error", name="ingestion_stage", create_type=False), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("celery_task_id", sa.String(255), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ingestion_jobs_tenant_id", "ingestion_jobs", ["tenant_id"])
    op.create_index("ix_ingestion_jobs_document_id", "ingestion_jobs", ["document_id"])
    op.create_index("ix_ingestion_jobs_status", "ingestion_jobs", ["status"])

    # ── chunks ───────────────────────────────────────────────────────────
    # Vector column added via raw SQL (alembic doesn't natively know pgvector).
    op.create_table(
        "chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("document_versions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("content_tsv", postgresql.TSVECTOR(), nullable=True),
        sa.Column("page", sa.Integer(), nullable=True),
        sa.Column("section", sa.String(512), nullable=True),
        sa.Column("bbox", postgresql.JSONB(), nullable=True),
        sa.Column("char_start", sa.Integer(), nullable=True),
        sa.Column("char_end", sa.Integer(), nullable=True),
        sa.Column("chunk_strategy", sa.String(32), nullable=True),
        sa.Column("embedding_status", postgresql.ENUM("pending", "embedded", "failed", name="embedding_status", create_type=False), nullable=False, server_default="pending"),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("ingested_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("document_id", "chunk_index", name="uq_chunk_doc_index"),
    )
    op.create_index("ix_chunks_tenant_id", "chunks", ["tenant_id"])
    op.create_index("ix_chunks_document_id", "chunks", ["document_id"])
    # Add embedding column using raw DDL (pgvector type).
    op.execute("ALTER TABLE chunks ADD COLUMN embedding vector(1024)")
    op.execute(
        "CREATE INDEX ix_chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64) WHERE embedding IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX ix_chunks_content_tsv ON chunks USING gin (content_tsv) WHERE content_tsv IS NOT NULL"
    )

    # ── processing_failures ──────────────────────────────────────────────
    op.create_table(
        "processing_failures",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ingestion_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stage", postgresql.ENUM("queued", "extract", "ocr", "chunk", "embed", "index", "done", "error", name="ingestion_stage", create_type=False), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("error_type", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("traceback", sa.Text(), nullable=True),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("is_terminal", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_processing_failures_tenant_id", "processing_failures", ["tenant_id"])

    # ── RLS policies ─────────────────────────────────────────────────────
    for table in ("documents", "document_versions", "ingestion_jobs", "chunks", "processing_failures"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    op.execute(
        "CREATE POLICY tenant_isolation ON documents "
        "USING (tenant_id = current_setting('app.tenant_id', true)::uuid)"
    )
    op.execute(
        "CREATE POLICY tenant_isolation ON ingestion_jobs "
        "USING (tenant_id = current_setting('app.tenant_id', true)::uuid)"
    )
    op.execute(
        "CREATE POLICY tenant_isolation ON chunks "
        "USING (tenant_id = current_setting('app.tenant_id', true)::uuid)"
    )
    op.execute(
        "CREATE POLICY tenant_isolation ON processing_failures "
        "USING (tenant_id = current_setting('app.tenant_id', true)::uuid)"
    )


def downgrade() -> None:
    for table in ("processing_failures", "chunks", "ingestion_jobs", "document_versions", "documents", "refresh_tokens", "users"):
        op.drop_table(table)

    for enum_name in ("embedding_status", "ingestion_stage", "job_status", "document_status", "document_source"):
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
