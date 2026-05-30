# Development Roadmap — Turkish RAG Platform

A phased plan from foundation to production. Each phase is independently
shippable and leaves the system in a working state. Phases are ordered by
**dependency** and **risk-retirement** (do the scary/uncertain parts early).

Legend: ✅ done · 🟡 in progress · ⬜ planned

---

## Phase 1 — Architecture & Foundation ✅

**Goal:** a coherent skeleton everything else hangs off.

- ✅ Architecture, DB design, roadmap docs
- ✅ Monorepo + docker-compose (postgres/pgvector, redis, rabbitmq, minio)
- ✅ Backend clean-architecture skeleton: config, logging, context, security,
  db, redis, exceptions, base repository, AI ports, DI deps, middleware
- ✅ `auth` module as the reference vertical slice (model→repo→service→router)
- ✅ Celery app + ingestion pipeline contracts
- ✅ Alembic async setup + seed script
- ✅ Frontend skeleton (Vite/React/Tailwind, router, auth store, API client with
  token refresh, feature-based pages)

**Exit criteria:** `make up` boots the stack; `/health/ready` is green;
`/docs` renders; frontend serves the login page.

---

## Phase 2 — Identity, Tenancy & Security backbone ⬜

**Goal:** real auth/authorization before any data exists. Security is cheapest
to build in first.

- ⬜ First migration (all tables from `DATABASE.md`) + custom Turkish FTS config
- ⬜ Postgres RLS policies + session `SET LOCAL app.tenant_id`
- ⬜ Tenant onboarding use-case (signup → tenant + owner membership) — the
  cross-module orchestration deferred from Phase 1
- ⬜ RBAC end-to-end (`require(permission)` on protected routes), API keys
- ⬜ Audit logging cross-cutting hook (auth events, RBAC denials)
- ⬜ Rate-limit tuning + per-endpoint cost weights
- ⬜ Tests: auth flows, RBAC matrix, tenant isolation (the highest-value tests)

**Priority: P0.** Nothing ships without this. **Risk:** RLS + async sessions
interaction — validate early.

---

## Phase 3 — Document Ingestion Pipeline ⬜

**Goal:** turn uploaded files into indexed, embedded chunks. This is the
highest-risk subsystem (OCR quality, Turkish handling, throughput).

- ⬜ Secure upload: presigned MinIO PUT, MIME sniffing, size/magic-byte checks,
  content-hash dedupe, quarantine-until-validated
- ⬜ Extractors: PDF (pypdf), DOCX, XLSX, CSV; image/scanned → OCR branch
- ⬜ OCR adapters: PaddleOCR (primary) + Tesseract (fallback) behind `OcrEngine`
- ⬜ Turkish normalization stage (dotted-İ, deascii guard, hyphenation, headers)
- ⬜ Semantic + layout-aware chunker behind `Chunker`
- ⬜ BGE-M3 embedder (dense+sparse) behind `Embedder`
- ⬜ pgvector + tsvector indexing; `ingestion_jobs` status + SSE progress
- ⬜ Celery wiring: retries, backoff, dead-letter queue
- ⬜ Tests: golden-file extraction, chunk boundaries, embedding shape, e2e ingest

**Priority: P0.** **Risk: HIGH** — prototype OCR + chunking on real Turkish docs
first (spike), then harden. Embedding/OCR run locally → validate hardware needs.

---

## Phase 4 — Retrieval & RAG Query Pipeline ⬜

**Goal:** accurate, cited answers. The product's reason to exist.

- ⬜ Hybrid retrieval (dense ⊕ lexical) with RRF + tenant/ACL prefilter
- ⬜ Cross-encoder reranking behind `Reranker`
- ⬜ Query rewrite (history-aware condensation + Turkish expansion)
- ⬜ Context compression + token budgeting
- ⬜ Gemini generation behind `LLM`, streaming (SSE), Turkish grounded prompt
- ⬜ Citation mapping (answer span → chunk → page/bbox) + faithfulness check
- ⬜ Prompt-injection guards (query + retrieved-context screening, refusal)
- ⬜ Conversation memory (summary-buffer) persisted per conversation
- ⬜ Eval harness: a Turkish QA set, retrieval recall@k, answer faithfulness

**Priority: P0.** **Risk: MEDIUM-HIGH** — measure retrieval quality with the eval
harness before tuning prompts; retrieval beats prompt-engineering for accuracy.

---

## Phase 5 — Core Frontend (Documents, Upload, Dashboard) ⬜

- ⬜ shadcn/ui setup, design tokens, app shell polish
- ⬜ Dashboard (stats, recent docs, ingestion status)
- ⬜ Upload center (drag-drop, presigned upload, live progress via SSE)
- ⬜ Document list/detail (status, metadata, delete, re-ingest)
- ⬜ TanStack Query data layer + optimistic updates

**Priority: P1.**

---

## Phase 6 — Chat, Search & Citation UX ⬜

- ⬜ Streaming chat UI (token stream, stop, regenerate)
- ⬜ Inline citations + citation viewer (PDF page + bbox highlight)
- ⬜ Semantic search interface with filters (doc type, date, source)
- ⬜ Conversation history sidebar

**Priority: P1.** The "wow" surface — Perplexity-style cited answers.

---

## Phase 7 — Admin, Settings & Observability UI ⬜

- ⬜ Admin panel (users, roles, tenant quotas, audit log viewer)
- ⬜ Settings (profile, API keys, model/retrieval prefs)
- ⬜ Grafana dashboards (RAG latency, cache hit, ingestion throughput, cost)
- ⬜ OpenTelemetry tracing api→worker→Gemini

**Priority: P2.**

---

## Phase 8 — Hardening & Production Readiness ⬜

- ⬜ CI: ruff + mypy + import-linter (boundary enforcement) + pytest + migration tests
- ⬜ Load testing (ingestion throughput, concurrent chat)
- ⬜ Security review (OWASP Top 10 pass, dependency scan, secret scan)
- ⬜ Backups/PITR, read replica, HNSW tuning
- ⬜ Blue-green deploy, feature flags, runbooks

**Priority: P2.**

---

## Implementation Priorities (TL;DR)

1. **Security/tenancy first** (Phase 2) — retrofitting auth is expensive and risky.
2. **De-risk the AI pipeline early** (Phases 3–4) — OCR/chunking/retrieval quality
   is the project's biggest unknown; spike it before building UI on top.
3. **Eval harness before prompt tuning** — measure retrieval/faithfulness, don't
   guess. Accuracy gains come from retrieval, not prompt wording.
4. **UI after the API is real** (Phases 5–6) — build screens against working
   endpoints, not mocks, to avoid contract churn.
5. **Observability is not optional** — ships alongside features, not after.

## Cross-cutting (every phase)

- Tests follow the 70/20/10 pyramid; migrations always tested in CI.
- Module boundaries enforced by import-linter (no cross-module internals).
- No secrets in code; structured logs with `request_id`/`tenant_id`, no PII.
- Each PR keeps `make lint` + `make test` green.
