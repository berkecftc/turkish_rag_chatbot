"""semantic_cache: per-user scoping

Documents are owner-scoped, so a cached RAG answer must never cross users.
Add a user_id column to semantic_cache and index it. Existing rows are
un-scoped and ephemeral (TTL), so they are cleared before the NOT NULL add.

Revision ID: 6c1a2b3d4e5f
Revises: 5b7c9d2e1f80
Create Date: 2026-07-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "6c1a2b3d4e5f"
down_revision = "5b7c9d2e1f80"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing entries predate per-user scoping and cannot be attributed to
    # an owner; drop them so the NOT NULL column can be added cleanly.
    op.execute("DELETE FROM semantic_cache")
    op.add_column(
        "semantic_cache",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
    )
    op.create_index(
        "ix_semantic_cache_user_id", "semantic_cache", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_semantic_cache_user_id", table_name="semantic_cache")
    op.drop_column("semantic_cache", "user_id")
