"""RAG engine schema: conversations, messages, citations, retrieval_logs, semantic_cache.

Revision ID: 0002_rag_schema
Revises: 0001_initial_schema
Create Date: 2026-05-26
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_rag_schema"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Enums ────────────────────────────────────────────────────────────
    message_role = postgresql.ENUM("user", "assistant", "system", name="message_role", create_type=True)
    message_role.create(op.get_bind(), checkfirst=True)

    # ── conversations ────────────────────────────────────────────────────
    op.create_table(
        "conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(512), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("total_messages", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens_used", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("last_message_at", sa.DateTime(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_conversations_tenant_id", "conversations", ["tenant_id"])
    op.create_index("ix_conversations_user_id", "conversations", ["user_id"])
    op.create_index("ix_conversations_last_message_at", "conversations", ["last_message_at"])

    # ── messages ─────────────────────────────────────────────────────────
    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", postgresql.ENUM("user", "assistant", "system", name="message_role", create_type=False), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model", sa.String(128), nullable=True),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("retrieval_quality", sa.Float(), nullable=True),
        sa.Column("has_citations", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("citation_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("hallucination_flags", postgresql.JSONB(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_messages_tenant_id", "messages", ["tenant_id"])
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])
    op.create_index("ix_messages_created_at", "messages", ["created_at"])

    # ── citations ────────────────────────────────────────────────────────
    op.create_table(
        "citations",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chunks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("citation_number", sa.Integer(), nullable=False),
        sa.Column("document_title", sa.String(512), nullable=False),
        sa.Column("text_excerpt", sa.Text(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("section", sa.String(512), nullable=True),
        sa.Column("vector_score", sa.Float(), nullable=True),
        sa.Column("rerank_score", sa.Float(), nullable=True),
        sa.Column("combined_score", sa.Float(), nullable=True),
        sa.Column("source_reliability", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_citations_tenant_id", "citations", ["tenant_id"])
    op.create_index("ix_citations_message_id", "citations", ["message_id"])
    op.create_index("ix_citations_document_id", "citations", ["document_id"])

    # ── retrieval_logs ────────────────────────────────────────────────────
    op.create_table(
        "retrieval_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("messages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("original_query", sa.Text(), nullable=False),
        sa.Column("rewritten_query", sa.Text(), nullable=True),
        sa.Column("query_intent", sa.String(32), nullable=True),
        sa.Column("vector_results_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("bm25_results_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reranked_results_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("final_context_chunks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("context_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("was_compressed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cache_hit", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("retrieval_latency_ms", sa.Integer(), nullable=True),
        sa.Column("rerank_latency_ms", sa.Integer(), nullable=True),
        sa.Column("generation_latency_ms", sa.Integer(), nullable=True),
        sa.Column("total_latency_ms", sa.Integer(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("vector_weight", sa.Float(), nullable=True),
        sa.Column("bm25_weight", sa.Float(), nullable=True),
        sa.Column("debug_payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_retrieval_logs_tenant_id", "retrieval_logs", ["tenant_id"])
    op.create_index("ix_retrieval_logs_message_id", "retrieval_logs", ["message_id"])
    op.create_index("ix_retrieval_logs_created_at", "retrieval_logs", ["created_at"])

    # ── semantic_cache ────────────────────────────────────────────────────
    op.create_table(
        "semantic_cache",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("query_hash", sa.String(64), nullable=False),
        sa.Column("original_query", sa.Text(), nullable=False),
        sa.Column("response_json", postgresql.JSONB(), nullable=False),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_semantic_cache_tenant_id", "semantic_cache", ["tenant_id"])
    op.create_index("ix_semantic_cache_query_hash", "semantic_cache", ["query_hash"])
    op.create_index("ix_semantic_cache_expires_at", "semantic_cache", ["expires_at"])
    # Add embedding vector column
    op.execute("ALTER TABLE semantic_cache ADD COLUMN query_embedding vector(1024)")
    op.execute(
        "CREATE INDEX ix_semantic_cache_embedding_hnsw ON semantic_cache "
        "USING hnsw (query_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64) "
        "WHERE query_embedding IS NOT NULL"
    )

    # ── RLS ──────────────────────────────────────────────────────────────
    for table in ("conversations", "messages", "citations", "retrieval_logs", "semantic_cache"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING (tenant_id = current_setting('app.tenant_id', true)::uuid)"
        )


def downgrade() -> None:
    for table in ("semantic_cache", "retrieval_logs", "citations", "messages", "conversations"):
        op.drop_table(table)
    op.execute("DROP TYPE IF EXISTS message_role")
