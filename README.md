# Turkish RAG Platform

Enterprise-grade, multi-tenant **Retrieval-Augmented Generation** platform for
secure internal document intelligence — optimized for **Turkish**. Upload
company documents (PDF/DOCX/XLSX/CSV/scanned images), index them with a hybrid
semantic + lexical pipeline, and chat with **cited, source-highlighted**
answers.

> Built as a production-shaped SaaS, not a demo: clean architecture, modular
> boundaries, async ingestion, RBAC + multi-tenancy, observability.

## Capabilities

- 📄 Multi-format ingestion with OCR (PaddleOCR/Tesseract) for scanned docs
- 🧠 Hybrid retrieval (dense BGE-M3 + lexical) → RRF fusion → cross-encoder rerank
- 🇹🇷 Turkish-optimized normalization, query rewriting, and grounded generation (Gemini)
- 🔗 Inline citations + source highlighting (page + bounding box)
- 💬 Conversation memory (summary-buffer), query rewriting, context compression
- 🔐 JWT auth, RBAC, rate limiting, prompt-injection mitigation, audit logging
- ⚙️ Async ingestion via Celery + RabbitMQ; pgvector single source of truth

## Tech stack

**Backend:** FastAPI · PostgreSQL 16 + pgvector · Redis · Celery · RabbitMQ
**AI/RAG:** Gemini · BGE-M3 · LlamaIndex · cross-encoder reranking
**Frontend:** React · Vite · TailwindCSS · shadcn/ui · Zustand · TanStack Query
**Infra:** Docker · Docker Compose · MinIO (S3)

## Quick start

```bash
cp .env.example .env          # fill GEMINI_API_KEY + JWT keys
make up                       # build & start full stack
make migrate                  # apply DB schema
make seed                     # roles, permissions, demo tenant
```

- API:        http://localhost:8000  (docs: `/docs`)
- Frontend:   http://localhost:5173
- RabbitMQ:   http://localhost:15672
- MinIO:      http://localhost:9001

## Documentation

| Doc | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, service boundaries, RAG pipeline, security, observability |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema, indexes, hybrid query, RLS, scaling |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased build plan + implementation priorities |

## Repository layout

```
backend/    FastAPI app (clean architecture: core / domain / modules / infrastructure / workers)
frontend/   React SPA (feature-based)
docs/        Architecture, database, roadmap
docker-compose.yml + override   Full local stack
```

## Project status

Phase 1 (architecture + scaffolding) — see the roadmap for what's next.
