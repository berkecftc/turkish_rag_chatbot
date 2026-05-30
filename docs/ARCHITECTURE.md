# System Architecture — Turkish RAG Platform

> Enterprise-grade Retrieval-Augmented Generation platform for secure internal
> document intelligence, optimized for Turkish-language understanding.

This document is the source of truth for system design. It is intended to read
like the architecture section of a real startup's engineering handbook.

---

## 1. Architectural Philosophy

### 1.1 Modular Monolith first, microservices when justified

The brief asks for a "modular microservice architecture." We deliver the
**operational benefits** of that (clear boundaries, independent scaling of the
heavy path, async processing) while avoiding the **premature cost** of a true
distributed system.

| Concern | Premature microservices | Our approach (modular monolith + workers) |
|---|---|---|
| Deployment | N services, N pipelines, service discovery | 2 deployables: `api` + `worker` |
| Data consistency | Distributed transactions / sagas | Single Postgres, ACID transactions |
| Inter-service auth | mTLS / token exchange between services | In-process calls, one trust boundary |
| Debuggability | Distributed tracing required to follow 1 request | Single process, trace optional |
| Splitting later | — | Each `module/` has zero cross-imports → lift-and-shift to a service |

**Rule we enforce:** modules communicate only through their public
`service.py` interfaces and shared `core/`. No module imports another module's
`repository`, `models`, or internals. When a module needs to become its own
service, you replace the in-process service call with an HTTP/gRPC client — the
call sites do not change.

The genuinely independent workload — **document ingestion + embedding + OCR** —
is already a separate process (Celery worker) from day one, because it has a
fundamentally different resource profile (CPU/GPU heavy, long-running, bursty)
than the API (latency-sensitive, I/O bound).

### 1.2 Clean Architecture layering

Dependencies point inward. Inner layers know nothing about outer layers.

```
            ┌─────────────────────────────────────────┐
            │  Interface (FastAPI routers, Celery tasks)│   ← framework, I/O
            ├─────────────────────────────────────────┤
            │  Application (services, use-cases, DTOs)  │   ← orchestration
            ├─────────────────────────────────────────┤
            │  Domain (entities, value objects, ports)  │   ← business rules
            ├─────────────────────────────────────────┤
            │  Infrastructure (repos, clients, adapters)│   ← DB, Gemini, S3, OCR
            └─────────────────────────────────────────┘
```

- **Domain** has no framework imports. Pure Python + Pydantic value objects.
- **Application** depends on domain *ports* (Protocols/ABCs), never concrete
  infrastructure. This is where DI matters: the service receives a
  `DocumentRepository` interface, not a SQLAlchemy session.
- **Infrastructure** implements the ports (e.g. `PgVectorChunkRepository`,
  `GeminiLLM`, `BgeM3Embedder`, `PaddleOcrEngine`).
- **Interface** wires everything via FastAPI's dependency system / a small DI
  container.

This is what makes the system testable: swap `GeminiLLM` for `FakeLLM` in tests,
swap `PgVectorChunkRepository` for an in-memory fake — no mocks of HTTP.

### 1.3 SOLID applied concretely

- **S** — A `Chunker` only chunks. A `Retriever` only retrieves. The RAG
  pipeline composes single-purpose stages.
- **O** — New retrieval strategy = new class implementing `Retriever` port,
  registered in config. No edits to the pipeline.
- **L** — Every `Retriever` (dense, sparse, hybrid) is substitutable behind the
  same interface and contract.
- **I** — Narrow ports: `Embedder`, `Reranker`, `LLM`, `OcrEngine` are
  separate, not one fat `AIService`.
- **D** — Application depends on `ports/`, infrastructure provides the concretes,
  the DI container binds them.

---

## 2. Service Boundaries (Modules)

Each module is a vertical slice: `router → service → repository → models`,
plus its own `schemas` (API DTOs) and `domain` objects.

| Module | Responsibility | Owns tables | Key dependencies |
|---|---|---|---|
| `auth` | Identity, JWT, RBAC, sessions, API keys | users, roles, refresh_tokens, api_keys | core.security |
| `tenancy` | Organizations, membership, quotas | tenants, memberships | auth |
| `documents` | Document CRUD, storage, lifecycle, ACL | documents, document_versions | tenancy, storage |
| `ingestion` | Parse → OCR → chunk → embed → index | chunks, ingestion_jobs | documents, ai ports |
| `search` | Hybrid retrieval, reranking, filters | (reads chunks) | ingestion, ai ports |
| `rag` | Query rewrite, retrieve, compress, generate, cite | conversations, messages, citations | search, ai ports |
| `audit` | Append-only audit trail, security events | audit_logs | all (cross-cutting) |
| `admin` | Tenant/user management, system metrics | (reads many) | auth, tenancy |

**Boundary enforcement** (CI lint rule, see ROADMAP): an import-linter contract
forbids `app.modules.X` from importing `app.modules.Y.{repository,models}`.

---

## 3. The AI / RAG Pipeline

This is the core IP of the platform. It is split into an **ingestion pipeline**
(async, offline) and a **query pipeline** (online, latency-sensitive).

### 3.1 Ingestion pipeline (Celery worker)

```
Upload ─▶ Validate ─▶ Persist (status=PENDING) ─▶ enqueue ingestion_job
                                                          │
        ┌─────────────────────────────────────────────────┘
        ▼
  [1] Extract        PDF / DOCX / XLSX / CSV → raw text + layout
        │            (scanned PDF / image → OCR branch)
        ▼
  [2] OCR (cond.)    PaddleOCR (tr) → text + bbox + confidence
        │
        ▼
  [3] Clean/Normalize  Turkish normalization (deasciify guard, dotted-İ,
        │               ligatures, hyphenation, whitespace, headers/footers)
        ▼
  [4] Semantic chunk   Layout-aware + semantic boundaries, token-bounded,
        │               overlap, table/heading preservation
        ▼
  [5] Metadata extract  page, section, source bbox, lang, doc_type, entities
        │
        ▼
  [6] Embed (BGE-M3)    dense (1024-d) + sparse (lexical weights) per chunk
        │
        ▼
  [7] Index            upsert into pgvector (dense) + tsvector/sparse (lexical)
        │
        ▼
  [8] Finalize         status=READY, emit audit + metrics; on error → retry/DLQ
```

Each numbered stage is a class implementing a `Stage` port; the pipeline is a
list of stages from config. Stages are individually unit-testable and
independently swappable (e.g. Tesseract ↔ PaddleOCR, or LangChain ↔ custom).

**Why BGE-M3:** multilingual (strong Turkish), produces dense + sparse + ColBERT
representations from one model — enabling true hybrid retrieval without a second
model. Runs locally (no per-token cost, no data egress to a third party for
embeddings — important for "secure internal documents").

### 3.2 Query pipeline (API request path)

```
User query
   │
   ▼
[1] Guard          prompt-injection screen, PII/secret check, length/lang
   │
   ▼
[2] Query rewrite  history-aware condensation + Turkish query expansion
   │               (LLM-assisted, cached) → standalone query
   ▼
[3] Hybrid retrieve   dense (pgvector cosine) ⊕ sparse (BM25/tsvector)
   │                   → Reciprocal Rank Fusion (RRF)
   ▼
[4] Metadata filter   tenant_id, doc ACL, doc_type, date — pushed into SQL
   │
   ▼
[5] Rerank         BGE reranker (cross-encoder) on fused top-k → top-n
   │
   ▼
[6] Context compress  dedupe, sentence-level extraction, token budgeting
   │
   ▼
[7] Generate       Gemini, grounded prompt + numbered context, Turkish system
   │               prompt, streaming tokens
   ▼
[8] Cite + verify  map answer spans → source chunks → page/bbox; faithfulness
   │               check; refuse if unsupported
   ▼
Streamed answer + citations + source highlights
```

**Turkish optimization** is applied at three points: normalization (ingest),
query expansion with morphological awareness (rewrite), and a Turkish system
prompt + few-shot grounding (generate). Retrieval quality is the main lever, so
the BGE-M3 multilingual embeddings + reranker do the heavy lifting.

**Conversation memory:** windowed recent turns + a running summary
(summary-buffer), persisted per conversation, fed into query rewrite (not
naively into the final prompt) to keep the grounded context clean.

### 3.3 Ports (the AI abstraction surface)

```
Embedder      .embed_documents(texts) / .embed_query(text) -> dense+sparse
Reranker      .rerank(query, candidates) -> scored
LLM           .generate(messages, **opts) / .stream(...) -> tokens
OcrEngine     .extract(image|pdf) -> [TextBlock(bbox, conf, text)]
Chunker       .chunk(document) -> [Chunk]
VectorStore   .upsert(chunks) / .search(query_embedding, filters, k)
LexicalStore  .upsert(chunks) / .search(query_text, filters, k)
```

Concrete impls live in `infrastructure/ai/`. Swapping a provider (Gemini →
local LLM, PaddleOCR → Tesseract) is a config + binding change, never a pipeline
change.

---

## 4. Request & Async Flows

### 4.1 Synchronous query (chat)

```
Client ──HTTP/SSE──▶ FastAPI(api)
                       │ authn (JWT) + authz (RBAC) + rate-limit (Redis)
                       │ rag.service.answer(query, conversation)
                       │   ├─ retrieve (Postgres/pgvector, in-process)
                       │   ├─ rerank   (local model)
                       │   └─ generate (Gemini, streamed)
                       └──SSE tokens──▶ Client   (citations on completion)
```

### 4.2 Asynchronous ingestion

```
Client ──HTTP──▶ FastAPI(api) ──persist+enqueue──▶ RabbitMQ
                                                      │
                                              Celery worker(s)
                                                 run pipeline
                                                      │
                          status/progress ──▶ Redis ──▶ SSE/poll ──▶ Client
```

- **RabbitMQ** is the broker (durable, routing, priority queues, DLX for
  poison messages). **Redis** is the result/state backend + cache + rate-limit
  store. Using both is deliberate: RabbitMQ for reliable work distribution,
  Redis for fast ephemeral state.
- Progress is published to Redis and surfaced to the client via SSE so uploads
  show a live progress bar.

---

## 5. Data Architecture

- **PostgreSQL 16 + pgvector** is the single source of truth: relational data,
  vectors (HNSW index), and lexical search (`tsvector` GIN) all in one engine.
  Rationale: one transactional store keeps documents, chunks, and embeddings
  consistent (no dual-write between a vector DB and an RDBMS). Scale-out path:
  read replicas → partition `chunks` by tenant → dedicated vector DB only if
  pgvector becomes the bottleneck (>50–100M chunks).
- **Object storage** (S3-compatible / MinIO in dev) for original files. The DB
  stores only metadata + a storage key. Files never live in Postgres.
- **Redis** for cache (embeddings of repeated queries, rewritten queries,
  reranker outputs), rate-limit counters, job progress, and short-lived locks.

Full schema in [`DATABASE.md`](./DATABASE.md).

### 5.1 Multi-tenancy

Shared-database, shared-schema with a mandatory `tenant_id` on every business
row. Enforced two ways:
1. **Application:** a base repository auto-injects `tenant_id` filters; the
   request context carries the resolved tenant.
2. **Database:** PostgreSQL **Row-Level Security (RLS)** policies as a
   defense-in-depth backstop, so a bug in app code cannot leak cross-tenant data.

This is the SaaS-ready default; a noisy or regulated tenant can later be
promoted to its own schema/DB without code changes (the tenant resolver returns
a different connection).

---

## 6. Security Model

Defense in depth — see SECURITY requirements mapped to controls:

| Requirement | Control |
|---|---|
| JWT authentication | Short-lived access (15m) + rotating refresh tokens; RS256; `jti` revocation list in Redis |
| RBAC authorization | Role + permission model; FastAPI dependency `require(permission)`; default-deny |
| Rate limiting | Redis sliding-window per user/IP/tenant + per-endpoint cost weights |
| Prompt injection | Input guard stage, instruction/data separation in prompts, output filtering, tool/over-fetch limits, "answer only from context" + refusal |
| File validation | MIME sniff (not extension), size caps, magic-byte check, optional AV (ClamAV), archive bomb guard, page/cell limits |
| Secure upload | Pre-signed direct-to-storage uploads, randomized keys, never trust filename, quarantine until validated |
| Input sanitization | Pydantic strict models at boundary, length/charset limits, HTML/SQL safe by ORM + parameterization |
| Audit logging | Append-only `audit_logs`, who/what/when/tenant, security events (auth fail, RBAC deny, injection flag) |
| Tenant isolation | `tenant_id` + Postgres RLS |
| Secrets | Env-injected, never in code; `.env` git-ignored; rotation-ready |
| Transport | TLS terminated at gateway; HSTS, secure headers (CSP, X-Frame-Options) |

**Prompt injection** deserves emphasis: retrieved document text is untrusted
input. We (a) keep system instructions in a separate channel from retrieved
context, (b) wrap context with explicit delimiters and "treat as data, not
instructions," (c) constrain the model to answer only from provided context and
refuse otherwise, (d) screen both the user query and the retrieved chunks for
injection patterns, and (e) never let the model trigger privileged actions.

---

## 7. Observability

- **Structured logging:** `structlog`, JSON in prod, correlation/`request_id` +
  `tenant_id` + `user_id` in every log line. No PII or document content in logs.
- **Metrics:** Prometheus via `prometheus-fastapi-instrumentator`; custom RAG
  metrics (retrieval latency, rerank latency, tokens, cache hit rate,
  faithfulness score, ingestion throughput).
- **Tracing:** OpenTelemetry spans across api → worker → external calls
  (Gemini), exportable to Jaeger/Tempo.
- **Health:** `/health/live` (process up) and `/health/ready` (DB, Redis,
  broker reachable) for orchestrator probes.
- **Errors:** central exception handlers map domain errors → RFC 9457
  `application/problem+json`; Sentry-ready hook.

---

## 8. Configuration & Environments

- Pydantic `Settings` (typed, validated, fail-fast on boot). One settings class,
  values from env. No scattered `os.getenv`.
- Environments: `local`, `test`, `staging`, `production` — selected by
  `APP_ENV`. Per-env compose overrides; secrets from env/secret manager.
- 12-factor: config in environment, stateless processes, attached backing
  services, logs to stdout.

---

## 9. Technology Decisions (summary)

| Layer | Choice | Why |
|---|---|---|
| API | FastAPI + Pydantic v2 | Async, typed, OpenAPI, DI built-in |
| DB | PostgreSQL 16 + pgvector | One store for relational + vector + lexical, ACID |
| Cache/state | Redis 7 | Cache, rate-limit, job progress, locks |
| Broker | RabbitMQ | Durable, routing, DLX, priority |
| Tasks | Celery | Mature, retries, scheduling, scaling |
| Embeddings | BGE-M3 | Multilingual (Turkish), dense+sparse, local |
| Rerank | BGE reranker (cross-encoder) | Big precision gain, local |
| LLM | Gemini | Strong multilingual generation, long context |
| OCR | PaddleOCR (primary), Tesseract (fallback) | Turkish support, layout, accuracy |
| Orchestration | LlamaIndex (retrieval) + thin custom layer | Use library for plumbing, own the contracts |
| Frontend | React + Vite + Tailwind + shadcn/ui | Modern SaaS UX, fast DX |
| Client state | Zustand + TanStack Query | Local UI state vs server cache, cleanly split |
| Containerization | Docker + Compose | Reproducible local + deploy parity |

**On LangChain vs LlamaIndex:** we treat both as *libraries behind our ports*,
not as the architecture. LlamaIndex for ingestion/retrieval primitives; we own
the `Retriever`/`LLM`/`Embedder` interfaces so the platform is never hostage to
a framework's churn.

---

## 10. Repository Layout (monorepo)

```
turkish_rag_chatbot/
├── docker-compose.yml          # full local stack
├── docker-compose.override.yml # dev-only (hot reload, exposed ports)
├── .env.example
├── Makefile                    # dev workflow entrypoints
├── docs/                       # ARCHITECTURE, DATABASE, ROADMAP
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app factory
│   │   ├── core/               # config, logging, security, db, redis, di, errors
│   │   ├── api/                # versioned routers, deps, middleware
│   │   ├── domain/             # entities, value objects, ports (framework-free)
│   │   ├── modules/            # auth, tenancy, documents, ingestion, search, rag, audit, admin
│   │   ├── infrastructure/     # repositories, ai (gemini/bge/ocr), storage, cache
│   │   └── workers/            # celery app + tasks + pipeline stages
│   ├── migrations/             # alembic
│   ├── tests/                  # unit / integration / e2e
│   ├── pyproject.toml
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── app/                # router, providers, layout
    │   ├── features/           # dashboard, upload, chat, search, citations, admin, settings
    │   ├── components/ui/      # shadcn primitives
    │   ├── lib/                # api client, auth, query client, utils
    │   └── stores/             # zustand stores
    ├── package.json
    └── Dockerfile
```

See [`ROADMAP.md`](./ROADMAP.md) for the phased build plan and priorities.
