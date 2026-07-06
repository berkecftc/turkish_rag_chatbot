"""Document persistence."""
from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.infrastructure.repository import BaseRepository, TenantScopedRepository
from app.modules.documents.models import Document, DocumentVersion


class DocumentRepository(TenantScopedRepository[Document]):
    model = Document

    async def get_by_content_hash(self, content_hash: str) -> Document | None:
        stmt = select(Document).where(
            Document.tenant_id == self.tenant_id,
            Document.content_hash == content_hash,
            Document.deleted_at.is_(None),
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_active(self, document_id: uuid.UUID) -> Document | None:
        stmt = select(Document).where(
            Document.id == document_id,
            Document.tenant_id == self.tenant_id,
            Document.deleted_at.is_(None),
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_by_owner(
        self, owner_id: uuid.UUID, *, limit: int = 50, offset: int = 0
    ) -> list[Document]:
        stmt = (
            select(Document)
            .where(
                Document.tenant_id == self.tenant_id,
                Document.owner_id == owner_id,
                Document.deleted_at.is_(None),
            )
            .order_by(Document.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_active_for_owner(
        self, document_id: uuid.UUID, owner_id: uuid.UUID
    ) -> Document | None:
        stmt = select(Document).where(
            Document.id == document_id,
            Document.tenant_id == self.tenant_id,
            Document.owner_id == owner_id,
            Document.deleted_at.is_(None),
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()


class DocumentVersionRepository(BaseRepository[DocumentVersion]):
    model = DocumentVersion

    async def next_version_number(self, document_id: uuid.UUID) -> int:
        stmt = select(func.coalesce(func.max(DocumentVersion.version), 0)).where(
            DocumentVersion.document_id == document_id
        )
        current = (await self.session.execute(stmt)).scalar_one()
        return int(current) + 1
