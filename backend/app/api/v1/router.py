"""Aggregates v1 module routers. Modules register here; nowhere else."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import health
from app.modules.auth.router import router as auth_router
from app.modules.documents.router import router as documents_router
from app.modules.ingestion.router import router as ingestion_router
from app.modules.rag.router import router as rag_router

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth_router)
api_router.include_router(documents_router)
api_router.include_router(ingestion_router)
api_router.include_router(rag_router)
