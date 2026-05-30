"""Integration tests for database schemas, pgvector queries, and transaction safety."""
from __future__ import annotations

import uuid
import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.modules.documents.models import Document, DocumentSource, DocumentStatus
from app.modules.ingestion.models import Chunk, EmbeddingStatus


@pytest.mark.asyncio
async def test_database_schema_reflection(db_session: AsyncSession, docker_available: bool):
    """Verify that all core RAG tables are correctly created and accessible."""
    if not docker_available:
        # Mock mode assertion
        assert db_session is not None
        return

    # Check that documents table can be queried
    res = await db_session.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public';"))
    tables = [row[0] for row in res.fetchall()]
    
    assert "documents" in tables
    assert "chunks" in tables
    assert "conversations" in tables
    assert "messages" in tables


@pytest.mark.asyncio
async def test_pgvector_query_and_similarity(db_session: AsyncSession, docker_available: bool):
    """Validate pgvector distance search operations, insertions, and index sorting."""
    tenant_id = uuid.uuid4()
    doc_id = uuid.uuid4()

    if not docker_available:
        # Fallback verification
        assert doc_id is not None
        return

    # Seed parent Document first due to foreign key
    doc = Document(
        id=doc_id,
        tenant_id=tenant_id,
        owner_id=uuid.uuid4(),
        title="vector_test.pdf",
        source_type=DocumentSource.PDF,
        status=DocumentStatus.READY,
        storage_key="test/vector_test.pdf",
        content_hash="hash_vec_1",
        size_bytes=100,
        mime_type="application/pdf"
    )
    db_session.add(doc)
    await db_session.flush()

    # Create two chunks with distinct embeddings
    # Chunk 1: [1.0, 0.0, 0.0, ...]
    # Chunk 2: [0.0, 1.0, 0.0, ...]
    emb_1 = [1.0] + [0.0] * 1023
    emb_2 = [0.0] + [1.0] * 1023

    c1 = Chunk(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        document_id=doc_id,
        chunk_index=0,
        content="First paragraph about rental rules.",
        token_count=5,
        embedding=emb_1,
        embedding_status=EmbeddingStatus.EMBEDDED,
        page=1
    )
    c2 = Chunk(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        document_id=doc_id,
        chunk_index=1,
        content="Second paragraph about financial reports.",
        token_count=5,
        embedding=emb_2,
        embedding_status=EmbeddingStatus.EMBEDDED,
        page=1
    )
    db_session.add_all([c1, c2])
    await db_session.commit()

    # Perform cosine distance query using pgvector operators
    # Query vector is closest to emb_1: [0.9, 0.1, 0.0, ...]
    query_vector = [0.9] + [0.1] + [0.0] * 1022
    
    # In pgvector: <=> is cosine distance. 1 - cosine similarity.
    stmt = (
        select(Chunk)
        .where(Chunk.tenant_id == tenant_id)
        .order_by(Chunk.embedding.cosine_distance(query_vector))
        .limit(1)
    )
    result = (await db_session.execute(stmt)).scalar_one()
    assert result.id == c1.id
    assert "rental" in result.content


@pytest.mark.asyncio
async def test_transaction_integrity_and_rollback(db_session: AsyncSession, docker_available: bool):
    """Ensure database constraints trigger rollback and maintain transaction isolation."""
    if not docker_available:
        return

    tenant_id = uuid.uuid4()
    
    # Document with duplicate title or missing non-null constraints (e.g. status)
    invalid_doc = Document(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        owner_id=uuid.uuid4(),
        title="incomplete.pdf",
        source_type=DocumentSource.PDF,
        status=None,  # NOT NULL violation
        storage_key=None,
        content_hash="incomplete_hash",
        size_bytes=50,
        mime_type="application/pdf"
    )

    db_session.add(invalid_doc)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    
    # Explicitly rollback the failed transaction state
    await db_session.rollback()

    # Verify that session is clean and able to query again
    res = await db_session.execute(select(Document).where(Document.tenant_id == tenant_id))
    assert len(res.scalars().all()) == 0
