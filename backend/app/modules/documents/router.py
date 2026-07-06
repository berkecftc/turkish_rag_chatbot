"""Documents HTTP interface: upload, list, get, soft-delete."""
from __future__ import annotations

import io
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, get_principal, require
from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.domain.ports import ObjectStorage
from app.modules.documents.repository import DocumentRepository
from app.modules.documents.schemas import DocumentOut, UploadResponse
from app.modules.documents.service import DocumentUploadService

router = APIRouter(prefix="/documents", tags=["documents"])


def _storage() -> ObjectStorage:
    from app.infrastructure.ingestion.storage.minio_storage import MinioStorage

    return MinioStorage(get_settings())


def _upload_service(
    session: AsyncSession = Depends(get_db),
    storage: ObjectStorage = Depends(_storage),
) -> DocumentUploadService:
    return DocumentUploadService(session=session, settings=get_settings(), storage=storage)


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: Annotated[UploadFile, File(description="PDF, DOCX, XLSX, CSV, PNG, or JPG")],
    principal: Principal = Depends(require("document:write")),
    svc: DocumentUploadService = Depends(_upload_service),
) -> UploadResponse:
    content = await file.read()
    return await svc.upload(
        fileobj=io.BytesIO(content),
        filename=file.filename or "upload",
        size_bytes=len(content),
        tenant_id=principal.tenant_id,
        owner_id=principal.user_id,
    )


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> list[DocumentOut]:
    repo = DocumentRepository(session, principal.tenant_id)
    docs = await repo.list_by_owner(principal.user_id, limit=limit, offset=offset)
    return [DocumentOut.model_validate(d) for d in docs]


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> DocumentOut:
    repo = DocumentRepository(session, principal.tenant_id)
    doc = await repo.get_active_for_owner(document_id, principal.user_id)
    if doc is None:
        raise NotFoundError(f"Document {document_id} not found")
    return DocumentOut.model_validate(doc)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    principal: Principal = Depends(require("document:delete")),
    session: AsyncSession = Depends(get_db),
) -> None:
    from datetime import datetime, timezone

    repo = DocumentRepository(session, principal.tenant_id)
    doc = await repo.get_active_for_owner(document_id, principal.user_id)
    if doc is None:
        raise NotFoundError(f"Document {document_id} not found")
    doc.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None)
