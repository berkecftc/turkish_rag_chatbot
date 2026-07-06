# 🇹🇷 Turkish RAG Platform

**Enterprise-grade, multi-tenant Retrieval-Augmented Generation platform for secure document intelligence — optimized for Turkish.**

Upload company documents (PDF, DOCX, XLSX, CSV, scanned images), let an async OCR-aware pipeline index them, and chat with **cited, source-grounded answers** — powered by a **local LLM (Ollama)** by default, with zero API cost and no data leaving your machine.

![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18_+_TypeScript-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_+_pgvector-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)
![LLM](https://img.shields.io/badge/LLM-Ollama_(local)-000000)
![License](https://img.shields.io/badge/License-MIT-green)

> Built as a **production-shaped SaaS**, not a demo: clean architecture with CI-enforced module boundaries, async ingestion, RBAC + multi-tenancy + per-user data isolation, full observability stack, tag-driven CI/CD, and a documented deployment story.

---

## Table of Contents

- [Highlights](#highlights)
- [Architecture](#architecture)
- [The RAG Pipeline](#the-rag-pipeline)
- [Ingestion Pipeline](#ingestion-pipeline)
- [Security Model](#security-model)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Demo Accounts & Roles](#demo-accounts--roles)
- [LLM Providers](#llm-providers)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [CI/CD & Production](#cicd--production)
- [Observability](#observability)
- [Design Decisions](#design-decisions)
- [Documentation](#documentation)

---

## Highlights

| | |
|---|---|
| 🧠 **Hybrid retrieval** | Dense (BGE-M3, 1024-dim) + lexical (Turkish full-text/BM25) → Reciprocal Rank Fusion → cross-encoder reranking (bge-reranker-v2-m3) |
| 🎛️ **Adaptive weighting** | Query-intent classification (factual / legal / financial / summarization / …) tunes vector-vs-BM25 fusion weights per query |
| 📄 **OCR-aware ingestion** | Async Celery pipeline: format detection → text extraction → OCR fallback (Tesseract `tur+eng`) → semantic chunking → batch embedding |
| 🔗 **Grounded citations** | Every answer carries inline `[N]` citations with document title, page, excerpt, and per-source reliability scores |
| 🚰 **True streaming** | Token-by-token SSE (`delta` / `citation` / `done` events) with stop support and graceful, localized error frames |
| 🏠 **Local-first LLM** | Ollama (default: `qwen2.5:7b-instruct`) — zero API cost, private by design; Gemini available behind a config switch |
| 🧊 **Semantic cache** | pgvector-backed response cache (exact-hash fast path + cosine-similarity match), scoped per user, TTL'd |
| 🛡️ **Hallucination guard** | Post-generation validation scores answer↔context alignment and flags ungrounded claims |
| 🏢 **Multi-tenant + RBAC** | Tenant isolation on every query; 4 roles (owner/admin/member/viewer) enforced by JWT permission claims on both API and UI |
| 👤 **Per-user isolation** | Documents, conversations, retrieval SQL, and the semantic cache are all scoped to the owning user |
| 💬 **Conversation memory** | Summary-buffer memory with LLM summarization + context-aware query rewriting; conversations are renamable and deletable |
| 📈 **Observability** | Prometheus `/metrics`, structured JSON logs (structlog), per-turn retrieval audit log with latency breakdown + built-in debug UI |

## Architecture

```
                          ┌──────────────────────────────┐
                          │     React SPA (Vite + TS)    │
                          │  TanStack Query · Zustand    │
                          └──────────────┬───────────────┘
                                         │ REST + SSE
                          ┌──────────────▼───────────────┐
                          │        FastAPI (async)       │
                          │  JWT RS256 · RBAC · rate-lim │
                          └─┬─────────┬─────────┬────────┘
             ┌──────────────┘         │         └────────────────┐
   ┌─────────▼──────────┐  ┌─────────▼─────────┐  ┌──────────────▼─────┐
   │ PostgreSQL 16      │  │ Redis             │  │ RabbitMQ           │
   │  + pgvector (HNSW) │  │  memory · ratelim │  │  ingestion queue   │
   │  chunks · cache    │  └───────────────────┘  └─────────┬──────────┘
   │  audit · citations │                                   │
   └────────────────────┘                         ┌─────────▼──────────┐
   ┌────────────────────┐  ┌───────────────────┐  │ Celery workers     │
   │ MinIO (S3 API)     │◄─┤ Ollama (local LLM)│◄─┤  extract · OCR     │
   │  original files    │  │  qwen2.5-instruct │  │  chunk · embed     │
   └────────────────────┘  └───────────────────┘  └────────────────────┘
```

**Clean architecture, enforced.** Backend modules (`auth`, `tenancy`, `documents`, `ingestion`, `rag`, …) are independent — cross-module imports are **blocked in CI by import-linter**. Infrastructure adapters (LLM, embedder, storage, OCR) implement domain ports, so providers are swappable behind interfaces.

## The RAG Pipeline

Every chat turn runs a 12+ stage pipeline:

```
query ─► security guard ─► Turkish query processing ─► LLM query rewrite
      (injection detect)   (normalize, intent)         (+ sub-questions)
                                                              │
   ┌──────────────────────────── semantic cache? ◄────── embed query
   │ hit                                                      │ miss
   ▼                                                          ▼
 cached                                        hybrid retrieval (parallel)
 answer                                     vector (pgvector HNSW) + BM25 (FTS)
                                            intent-adaptive weights + multi-hop
                                                              │
                                                        RRF fusion
                                                              │
                                              cross-encoder rerank (top-8)
                                                              │
                                            context packing (+ compression
                                             when context > token budget)
                                                              │
                                             grounded generation (streaming)
                                              system prompt enforces [N]
                                                              │
                              citation assembly ◄── hallucination validation
                                       │                      │
                                       ▼                      ▼
                              SSE: delta / citation / done (+ confidence)
                                       │
                        persist turn + retrieval audit log (latencies,
                        scores, weights, compression) → debug UI
```

Notable details:

- **Intent-adaptive fusion:** legal queries weight BM25 up to 0.65 (exact terminology matters); conversational queries weight vectors up to 0.75.
- **Multi-hop retrieval:** the rewriter decomposes complex questions into sub-questions, each retrieved separately and fused.
- **Context compression:** oversized contexts are LLM-compressed before generation instead of being truncated blindly.
- **Confidence scoring:** rerank scores + source reliability + hallucination flags → a per-answer confidence surfaced in the UI.
- **Friendly failure:** provider quota/429 errors degrade to a localized, human-readable message instead of a stack trace.

## Ingestion Pipeline

```
upload ─► SHA-256 dedup ─► MinIO put ─► RabbitMQ ─► Celery worker
                                                       │
                        format router (PDF / DOCX / XLSX / CSV / image)
                                                       │
                        text extraction ─► OCR-necessity heuristic
                                           (chars/page < threshold → OCR)
                                                       │
                                  Tesseract OCR (tur+eng) for scans/images
                                                       │
                        semantic chunking (256–1024 tokens, overlap 64)
                                                       │
                        BGE-M3 batch embedding ─► pgvector + tsvector
                                                       │
                        job status: PENDING → PROCESSING → READY/FAILED
                              (live-tracked in the UI ingestion monitor)
```

- Idempotent re-indexing — chunks are replaced per document version.
- Soft-delete with a partial unique index, so re-uploading a previously deleted document just works.
- Per-stage failure capture with a manual retry endpoint.

## Security Model

| Layer | Mechanism |
|---|---|
| Authentication | JWT **RS256** (asymmetric), 15-min access tokens + revocable refresh tokens (JTI blacklist in Redis) |
| Authorization | Default-deny RBAC — permissions (`document:write`, `admin:manage_users`, …) embedded in JWT claims, enforced by FastAPI dependencies **and** mirrored in UI affordances |
| Multi-tenancy | Tenant-ID scoping on every repository query |
| Per-user isolation | Documents, conversations, retrieval SQL (owner join), and semantic cache all filter by owning user |
| Prompt security | Injection-pattern detection on queries **and** sanitization of retrieved chunks (indirect injection defense) |
| Rate limiting | Per-user app-level middleware + (prod) nginx zones with a stricter budget for auth endpoints |
| Passwords | Argon2id hashing |
| Transport (prod) | TLS 1.2/1.3, HSTS, security headers, non-root containers, no published datastore ports |

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 · FastAPI · SQLAlchemy 2 (async) · Pydantic v2 · Alembic |
| AI / RAG | Ollama (qwen2.5) / Gemini · BGE-M3 · bge-reranker-v2-m3 · LlamaIndex (chunking) |
| Data | PostgreSQL 16 + pgvector (HNSW) · Redis 7 · RabbitMQ 3.13 · MinIO |
| Async | Celery 5 workers (dedicated ingestion queue) |
| Frontend | React 18 · TypeScript · Vite · TailwindCSS · shadcn/ui · TanStack Query · Zustand · Recharts |
| Observability | Prometheus · Grafana · Loki · Alertmanager · structlog |
| DevOps | Docker Compose (dev + prod topologies) · GitHub Actions · Trivy · nginx |

## Quick Start

**Prerequisites:** Docker Desktop (or Engine + Compose v2). ~10 GB free disk for models. NVIDIA GPU optional but strongly recommended for Ollama.

```bash
git clone https://github.com/berkecftc/turkish_rag_chatbot.git
cd turkish_rag_chatbot

# 1) Configure environment
cp .env.example .env
#    Generate JWT keys, then paste into .env (single line, \n-escaped):
openssl genrsa -out private.pem 2048 && openssl rsa -in private.pem -pubout -out public.pem

# 2) Start the stack (first run downloads embedding models — be patient)
docker compose up -d --build

# 3) Pull the local LLM (~4.7 GB)
docker exec turkish-rag-ollama-1 ollama pull qwen2.5:7b-instruct

# 4) Migrations + demo user
docker exec turkish-rag-api-1 alembic upgrade head
docker exec turkish-rag-api-1 python -m app.scripts.create_user

# 5) Open http://localhost:5173 and log in (accounts below)
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API docs (Swagger) | http://localhost:8000/docs |
| RabbitMQ console | http://localhost:15672 |
| MinIO console | http://localhost:9001 |

## Demo Accounts & Roles

The seed script creates a `demo` workspace with an owner account — **`admin@demo.com` / `Admin12345!`** (local demo defaults; override with `SEED_*` env vars). Seed other roles like so:

```bash
docker exec -e SEED_EMAIL=viewer@demo.com -e SEED_ROLE=viewer \
  turkish-rag-api-1 python -m app.scripts.create_user
```

| Role | Upload docs | Chat / Search | Delete docs | Admin panel | Tenant settings |
|---|---|---|---|---|---|
| **owner** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **admin** | ✅ | ✅ | ✅ | ✅ | — |
| **member** | ✅ | ✅ | — | — | — |
| **viewer** | — | ✅ | — | — | — |

Permissions live in the JWT (`perms[]`) and gate both API endpoints (`require("document:write")`) and UI affordances (upload buttons, delete icons, admin navigation). Each user sees only their **own** documents and conversations.

## LLM Providers

The LLM sits behind a domain port with a factory switch — swapping providers is pure configuration:

```env
LLM_PROVIDER=ollama              # local, private, free (default)
OLLAMA_MODEL=qwen2.5:7b-instruct
# — or —
LLM_PROVIDER=gemini              # Google AI Studio key required
GEMINI_API_KEY=...
```

All four LLM touchpoints (generation, query rewriting, context compression, memory summarization) route through the same factory. On a 12 GB GPU, `qwen2.5:7b-instruct` fits fully in VRAM; `14b` partially offloads to CPU (works, slower).

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/                  # deps (auth/RBAC), middleware, v1 router
│   │   ├── core/                 # config (pydantic-settings), logging, security
│   │   ├── domain/               # ports (LLM, embedder, storage, OCR)
│   │   ├── infrastructure/
│   │   │   ├── ai/               # Gemini + Ollama adapters, BGE-M3 embedder
│   │   │   ├── ingestion/        # extractors, OCR, chunking, storage
│   │   │   └── rag/              # retrieval, rerank, fusion, cache, citations,
│   │   │                         #   memory, security guard, validator, tracker
│   │   ├── modules/              # auth · tenancy · documents · ingestion · rag
│   │   │                         #   (independence enforced by import-linter)
│   │   └── workers/              # Celery app + tasks
│   ├── migrations/               # Alembic
│   └── tests/                    # unit · integration · e2e · evaluation
├── frontend/
│   └── src/
│       ├── app/                  # router, layouts, providers, command palette
│       ├── features/             # auth · chat · documents · upload · search ·
│       │                         #   conversations · dashboard · admin · settings
│       └── shared/               # API types, SSE client, hooks, utils
├── infra/                        # nginx · monitoring · deploy/backup scripts
├── .github/workflows/            # ci.yml · release.yml
├── docker-compose.yml            # dev stack (+ override: hot reload, ports)
├── docker-compose.prod.yml       # prod topology (isolated networks, limits)
└── docs/                         # architecture · database · deployment · roadmap
```

## Testing

```bash
docker exec turkish-rag-api-1 pytest tests/unit           # fast, isolated
docker exec turkish-rag-api-1 pytest tests/integration    # real PG/Redis/MQ
docker exec turkish-rag-api-1 pytest tests/e2e            # ingestion → chat flow
docker exec turkish-rag-api-1 pytest tests/evaluation     # RAG quality: groundedness,
                                                          #   hallucination, citations
```

Quality gates in CI: **ruff** · **mypy** · **import-linter** (architecture) · **ESLint** · **tsc** · **Trivy** (vulns + secrets) · **pip-audit**.

## CI/CD & Production

- **[`ci.yml`](.github/workflows/ci.yml)** — every PR: lint → type-check → unit + integration tests (against real service containers: pgvector, Redis, RabbitMQ, MinIO) → security scans → Docker build validation. The AI-evaluation suite runs weekly (token-cost isolation).
- **[`release.yml`](.github/workflows/release.yml)** — on `git tag vX.Y.Z`: build → push to GHCR → Trivy image scan → staging deploy → **manual approval gate** → production deploy over SSH.
- **[`docker-compose.prod.yml`](docker-compose.prod.yml)** — hardened single-host topology: only nginx publishes ports; isolated `edge` / `backend` / `monitor` networks; per-service resource limits; health-gated rolling deploys; optional GPU overlay.

Full production guide — server sizing, TLS/Let's Encrypt, backup & restore with RPO/RTO targets, scaling bottleneck analysis, Kubernetes migration path: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Observability

- **Metrics:** FastAPI `/metrics` (Prometheus) + exporters for Postgres, Redis, RabbitMQ, Celery, and the host — with a pre-provisioned Grafana dashboard.
- **Logs:** structured JSON (structlog) with request IDs, shipped to Loki in production.
- **RAG audit:** every turn persists a retrieval log — rewritten query, per-stage latencies (retrieval / rerank / generation), fusion weights, chunk scores, compression flag, confidence, cache hit — all inspectable in the built-in **retrieval debug UI**.
- **Alerts:** 13 pre-configured rules (service down, p95 latency, 5xx rate, queue backlog, OCR/Celery failures, disk/memory pressure).

## Design Decisions

| Decision | Rationale |
|---|---|
| **Local LLM by default** | Gemini's free tier throttles at 5 req/min — unusable for multi-document Q&A. Ollama removes quotas and keeps documents private. The provider stays swappable behind a port. |
| **pgvector over a dedicated vector DB** | One consistent store for chunks, metadata, FTS, and cache → transactional integrity and simpler ops. HNSW is plenty below ~5M chunks. |
| **RRF over score normalization** | Rank-based fusion is robust to the incomparable score distributions of cosine similarity vs BM25. |
| **Cross-encoder reranking** | Bi-encoder recall (top-50) is cheap but noisy; reranking to top-8 measurably improves the precision that grounded answers depend on. |
| **Celery + RabbitMQ for ingestion** | OCR of scanned PDFs takes tens of seconds — it must never block the API. The queue survives worker restarts; retries are explicit. |
| **RS256 over HS256** | Asymmetric keys let future services verify tokens without holding the signing secret. |
| **Semantic cache in Postgres** | Reuses the pgvector HNSW machinery; exact-hash fast path for repeated queries; per-user scoping prevents cross-user answer leakage. |

## Documentation

| Doc | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, service boundaries, RAG pipeline, security, observability |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema, indexes, hybrid query design, scaling |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production guide: sizing, TLS, backups/DR, scaling, K8s path |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased build plan |

## License

[MIT](LICENSE) © Ahmet Berke Çiftçi

---

<p align="center"><i>Built to explore what a production-quality, Turkish-first RAG system actually takes — from OCR to citations to ops.</i></p>
