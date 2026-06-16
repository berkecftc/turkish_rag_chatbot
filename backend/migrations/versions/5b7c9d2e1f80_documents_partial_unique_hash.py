"""documents: tenant/content_hash uniqueness excludes soft-deleted rows

A full UniqueConstraint on (tenant_id, content_hash) also counts soft-deleted
documents, so re-uploading a previously deleted document raised an
IntegrityError (HTTP 500). Replace it with a partial unique index scoped to
active rows (deleted_at IS NULL).

Revision ID: 5b7c9d2e1f80
Revises: 4ebc45702d35
Create Date: 2026-06-16
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "5b7c9d2e1f80"
down_revision = "4ebc45702d35"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_documents_tenant_hash", "documents", type_="unique")
    op.create_index(
        "uq_documents_tenant_hash",
        "documents",
        ["tenant_id", "content_hash"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_documents_tenant_hash", table_name="documents")
    op.create_unique_constraint(
        "uq_documents_tenant_hash", "documents", ["tenant_id", "content_hash"]
    )
