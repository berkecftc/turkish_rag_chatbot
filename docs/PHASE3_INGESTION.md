# Phase 3 — Document Ingestion Pipeline (Implementation Brief)

> **Audience:** an implementing agent (Antigravity `agy`) or engineer.
> **This is a build spec, not background reading.** Follow it precisely.
> Anchor everything to the EXISTING Phase 1 codebase — do not re-scaffold,
> do not reinvent config/db/auth. Extend.

---

## 0. Ground rules (read first)

- **Reuse Phase 1.** The repo already has: `app.core.config.Settings`,
  `app.core.db` (async engine, `Base`, `UUIDMixin`, `TimestampMixin`,
  `get_session`), `app.core.logging` (structlog + request context),
  `app.core.redis.redis_client`, `app.core.exceptions.AppError` hierarchy,
  `app.infrastructure.repository.{BaseRepository,TenantScopedRepository}`,
  `app.domain.ports` (`Embedder`, `OcrEngine`, `Chunker`, `ObjectStorage`,
  `TextBlock`, `Chunk`, `Embedding`, `RetrievedChunk`),
  `app.workers.celery_app.celery`, `app.workers.pipeline.{Pipeline,Stage,IngestionContext}`,
  `app.modules.auth` (reference vertical slice). **Use these.**
- **Clean architecture / SOLID.** Routes are thin (validate → call service).
  Business logic lives in services. Persistence behind repositories. External
  systems (OCR, embedder, storage, LLM) behind the `app.domain.ports` Protocols,
  bound via DI. No module imports another module's internals (import-linter
  contract in `pyproject.toml` is active).
- **Async everywhere** in the API; CPU/GPU-heavy work runs in the Celery worker.
- **Memory efficiency:** stream large files; never load a whole 500 MB PDF into
  RAM. Process page-by-page / batch embeddings.
- **Typing:** full type hints; Pydantic v2 DTOs at the boundary; mypy-strict.
- **Logging:** structured, with `request_id`/`tenant_id`/`document_id`/`job_id`;
  never log document content or PII.
- **Definition of done** is in §13. Add tests as specified.

---

## 1. Goal

Turn an uploaded file into tenant-isolated, retrieval-ready, **embedded +
indexed chunks**, fully asynchronously, with progress tracking, retries, a
dead-letter strategy, duplicate detection, versioning, and precise
chunk→source lineage. Optimized for **Turkish** enterprise documents.

Supported now: **PDF, scanned PDF, DOCX, XLSX, CSV.**
Future-ready (pluggable, do not implement yet): HTML, EML, PPTX, images.

---

## 2. Service responsibilities (the 9 services)

Each is a single-responsibility class with DI'd dependencies, structured
logging, and its own error type. Map them to files (see §5). None of them know
about FastAPI except through being called by a thin router/use-case.

| # | Service | Responsibility | Key deps (ports/repos) |
|---|---|---|---|
| 1 | **UploadService** | Persist file to object storage; create `documents` row (status=PENDING); compute SHA-256; dedupe; create version; enqueue job | `ObjectStorage`, `DocumentRepository`, Celery |
| 2 | **ValidationService** | MIME sniff, extension allowlist, size cap, magic-byte check, filename sanitization, path-traversal guard, malware-scan hook, archive-bomb guard | `Settings`, `MalwareScanner` port |
| 3 | **OcrService** | Detect if OCR is needed (necessity detection), run OCR only then; preserve page structure + tables; track per-block confidence; Turkish | `OcrEngine` (Paddle primary / Tesseract fallback) |
| 4 | **ParsingService** | Extract text + layout from PDF/DOCX/XLSX/CSV; route scanned PDFs to OCR; preserve headings/tables | `pymupdf`, `python-docx`, `pandas`, `unstructured` |
| 5 | **ChunkingService** | Adaptive, structure-aware chunking (semantic/recursive/header/table/metadata); emit lineage | `Chunker` impls, tokenizer |
| 6 | **MetadataExtractionService** | Doc-level + chunk-level metadata (page, section, bbox, lang, doc_type, entities, token_count) | parsers |
| 7 | **EmbeddingService** | Batch-embed chunks with BGE-M3 (dense+sparse); backpressure; retries | `Embedder` |
| 8 | **VectorStorageService** | Upsert chunks → pgvector (dense) + tsvector (lexical); transactional; idempotent re-index | `ChunkRepository` |
| 9 | **JobTrackingService** | `ingestion_jobs` lifecycle, stage/progress, attempts, publish progress to Redis (SSE), record failures | `IngestionJobRepository`, Redis |

**Composition:** services 3–8 are wrapped as `Stage` implementations and run by
`app.workers.pipeline.Pipeline`. The Celery task builds the pipeline from config
and runs it. JobTrackingService updates status around each stage.

---

## 3. Pipeline flow (authoritative)

```
POST /documents (multipart)            [API, async]
  └─ ValidationService.validate(file)          (sync, fast, pre-storage)
  └─ UploadService.ingest(file, meta)
        ├─ stream file -> ObjectStorage.put(key)        memory-efficient
        ├─ sha256 over stream -> content_hash
        ├─ dedupe: SELECT documents WHERE (tenant_id, content_hash)
        │     ├─ exists & same -> return existing (idempotent)
        │     └─ exists & new file for same logical doc -> new document_version
        ├─ INSERT documents (status=PENDING)
        ├─ INSERT ingestion_jobs (status=QUEUED, stage=QUEUED)
        └─ celery: ingest_document.delay(document_id, tenant_id)   -> RabbitMQ

WORKER  ingest_document(document_id, tenant_id)        [Celery, queue=ingestion]
  ctx = load file from storage (streamed)
  Pipeline([
     ExtractStage,        # PDF/DOCX/XLSX/CSV -> TextBlocks (+layout)
     OcrNecessityStage,   # decide; if scanned -> OcrStage
     OcrStage,            # conditional; Paddle/Tesseract; conf scores
     NormalizeStage,      # Turkish normalization
     MetadataStage,       # doc + block metadata
     ChunkStage,          # adaptive chunking + lineage
     EmbedStage,          # BGE-M3 dense+sparse, batched
     IndexStage,          # upsert pgvector + tsvector (txn)
  ]).run(ctx)
  -> documents.status = READY ; job.status = SUCCEEDED, progress=100
  on stage error -> retry w/ backoff; on final failure -> DLQ + status=FAILED +
     processing_failures row + audit event
```

JobTrackingService sets `job.stage`, `job.progress` after each stage and
publishes `{job_id, stage, progress}` to Redis channel `ingestion:{document_id}`
for SSE.

---

## 4. Database additions

`documents`, `document_versions`, `chunks`, `ingestion_jobs`, `audit_logs`
already exist in `docs/DATABASE.md`. **Add** these and create one Alembic
migration (`make makemigration m="phase3 ingestion"`):

### 4.1 `processing_failures` (error forensics, separate from audit)
```sql
CREATE TABLE processing_failures (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_id       UUID NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
    document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    stage        ingestion_stage NOT NULL,
    category     TEXT NOT NULL,        -- 'validation'|'extraction'|'ocr'|'embedding'|'storage'|'timeout'|'unknown'
    error_type   TEXT NOT NULL,        -- exception class
    message      TEXT NOT NULL,
    traceback    TEXT,
    attempt      INT NOT NULL,
    is_terminal  BOOLEAN NOT NULL DEFAULT false,  -- went to DLQ
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_failures_doc ON processing_failures (document_id, created_at DESC);
CREATE INDEX idx_failures_category ON processing_failures (category, created_at DESC);
```

### 4.2 `chunks` — confirm/extend columns for lineage + embedding status
Already has: id, tenant_id, document_id, chunk_index, content, token_count,
embedding VECTOR(1024), content_tsv, page, section, bbox, metadata. **Add:**
```sql
ALTER TABLE chunks ADD COLUMN document_version_id UUID REFERENCES document_versions(id);
ALTER TABLE chunks ADD COLUMN embedding_status TEXT NOT NULL DEFAULT 'pending';  -- pending|embedded|failed
ALTER TABLE chunks ADD COLUMN char_start INT;   -- lineage: offset in source text
ALTER TABLE chunks ADD COLUMN char_end INT;
ALTER TABLE chunks ADD COLUMN chunk_strategy TEXT;   -- semantic|recursive|header|table
ALTER TABLE chunks ADD COLUMN ingested_at TIMESTAMPTZ NOT NULL DEFAULT now();
```
Lineage = (`document_id`, `document_version_id`, `page`, `section`, `bbox`,
`char_start`, `char_end`). Every retrieved chunk can therefore point back to an
exact source location for citation/highlighting.

### 4.3 Vector storage / indexing (confirm in migration)
- Dense ANN: `hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)`.
- Lexical: `gin (content_tsv)` using the **custom Turkish FTS config** (create
  it in the migration: unaccent + snowball/simple + Turkish stopwords).
- Hybrid metadata filtering: `(tenant_id, document_id)` btree for ANN prefilter.
- Set `embedding_dim` from `Settings` (1024 for BGE-M3). Do not hardcode.

> **`embeddings` table?** The brief lists one, but we deliberately keep the
> vector **inline on `chunks`** (single row per chunk) — it's simpler, keeps
> lineage + vector + lexical in one transactional unit, and matches the HNSW
> index. Only split into a separate `embeddings` table if/when you support
> multiple embedding models per chunk (document that decision if you do).

---

## 5. Folder structure (create under existing `backend/app`)

```
app/modules/documents/            # document lifecycle + upload API (owns documents tables)
    models.py                     # Document, DocumentVersion ORM
    schemas.py                    # Upload/DocumentOut/VersionOut DTOs
    repository.py                 # DocumentRepository, DocumentVersionRepository
    service.py                    # UploadService (storage + dedupe + version + enqueue)
    router.py                     # POST /documents, GET /documents, GET /documents/{id}, DELETE
    validation.py                 # ValidationService + MalwareScanner port

app/modules/ingestion/            # the pipeline + jobs (owns chunks, ingestion_jobs, processing_failures)
    models.py                     # Chunk, IngestionJob, ProcessingFailure ORM
    schemas.py                    # JobStatusOut, ChunkOut, HistoryOut, RetryRequest
    repository.py                 # ChunkRepository, IngestionJobRepository, FailureRepository
    service.py                    # JobTrackingService, IngestionService (orchestrator)
    router.py                     # status/history/retry/cancel/metadata/chunks endpoints

app/infrastructure/ingestion/
    extractors/
        base.py                   # Extractor port: extract(file)->list[TextBlock]
        pdf.py                    # PyMuPDF extractor (+ scanned detection signal)
        docx.py
        xlsx.py
        csv.py
        registry.py               # source_type -> Extractor (open/closed; future: html/eml/pptx)
    ocr/
        base.py                   # OcrEngine impls
        paddle.py                 # PaddleOCR (primary, tr)
        tesseract.py              # Tesseract fallback (tr)
        necessity.py              # OcrNecessityDetector (see §7)
    chunking/
        base.py                   # Chunker port + ChunkStrategy
        semantic.py               # embedding-distance boundaries
        recursive.py              # recursive char/token splitter
        header_aware.py           # split on heading hierarchy
        table_aware.py            # keep tables intact, serialize rows
        adaptive.py               # AdaptiveChunker: picks/blends strategies (see §8)
    embedding/
        bge_m3.py                 # Embedder impl (dense+sparse, batched)
    storage/
        minio_storage.py          # ObjectStorage impl (boto3/minio, streaming, presigned)
    normalization/
        turkish.py                # Turkish text normalization (see §9)

app/workers/
    stages.py                     # Stage impls wrapping the services
    tasks.py                      # (exists) wire ingest_document to build+run Pipeline
    pipeline.py                   # (exists) Pipeline/Stage/IngestionContext

app/di.py                         # composition root: build services with bound adapters
```

---

## 6. Async processing, retries, DLQ

- **Broker:** RabbitMQ. **Queue:** `ingestion` (already routed in `celery_app`).
- **Retries:** `autoretry_for=(TransientError,)`, `retry_backoff=True`,
  `retry_jitter=True`, `max_retries=3`. Distinguish **transient** (network,
  rate-limit, timeout) from **permanent** (corrupt file, unsupported) — only
  retry transient.
- **DLQ:** declare a dead-letter exchange; on terminal failure, message routes
  to `ingestion.dlq`; mark `ingestion_jobs.status='dead'`,
  `documents.status='failed'`, write `processing_failures(is_terminal=true)`.
- **Idempotency:** the task must be safe to re-run (re-index deletes prior
  chunks for that `document_version_id` first, then inserts). `acks_late=True`
  already set — guard against duplicate delivery.
- **Cancellation:** `JobTrackingService.cancel(job_id)` sets a Redis flag the
  pipeline checks between stages; revoke the Celery task.
- **Large files / streaming:** extract page-by-page; embed in batches
  (`EMBED_BATCH` from settings, e.g. 32); bound memory.

---

## 7. OCR necessity detection (cost/perf optimization)

Run OCR **only when needed**. `OcrNecessityDetector.is_ocr_needed(doc) -> bool`:
- For PDF: sample N pages via PyMuPDF; if extractable text density (chars per
  page area) is below a threshold OR pages are image-only (`page.get_text()`
  empty but images present) → OCR needed.
- For images → always OCR.
- For DOCX/XLSX/CSV → never OCR.
- Track decision + per-page signal in metadata for observability.
OCR output: `list[TextBlock]` with `page`, `bbox`, `confidence`. Preserve page
order; attempt table region detection (Paddle structure) and keep tables as
serialized rows. Turkish: set OCR lang `tr`.

---

## 8. Chunking (adaptive + lineage)

Implement all five strategies behind a common `Chunker`/`ChunkStrategy`:
1. **Semantic** — split on embedding-distance / sentence-similarity drops.
2. **Recursive** — token/char recursive splitter with overlap.
3. **Header-aware** — respect heading hierarchy; section title → `chunk.section`.
4. **Table-aware** — never split a table mid-row; emit table chunks whole.
5. **Metadata-aware** — carry page/section/bbox/source into each chunk.

**AdaptiveChunker** picks strategy per region by document structure + semantic
density:
- Tables → table-aware. Headed prose → header-aware + semantic within sections.
- Dense uniform text → semantic with larger target size; sparse/listy → smaller.
- Target size adapts to token budget + measured semantic density (higher density
  → larger chunks, lower → smaller), bounded by `[CHUNK_MIN, CHUNK_MAX]` tokens
  with `CHUNK_OVERLAP`. All bounds from `Settings`.

Every chunk MUST carry the §4.2 lineage fields (`page`, `section`, `bbox`,
`char_start`, `char_end`, `chunk_index`, `chunk_strategy`, `document_version_id`)
so any future answer can cite the exact source location.

---

## 9. Turkish optimization

`normalization/turkish.py` applied before chunking:
- Correct dotted/dotless İ/ı casing; do NOT deasciify real content (guard).
- Fix soft-hyphen line-break joins; collapse OCR whitespace artifacts.
- Strip repeating headers/footers/page numbers.
- Normalize ligatures/Unicode (NFC).
- Sentence segmentation aware of Turkish abbreviations (e.g. "vb.", "Dr.").
- Populate `content_tsv` with the custom `turkish` FTS config + `unaccent`.
Keep it deterministic and unit-tested with Turkish fixtures.

---

## 10. Security (upload)

In `ValidationService`, before storage:
- **Extension allowlist** AND **MIME sniff** (python-magic / libmagic) must
  agree; reject on mismatch (defeats renamed-extension attacks).
- **Size cap** from `MAX_UPLOAD_MB`; reject early (stream, don't buffer all).
- **Magic-byte** verification per type.
- **Filename sanitization**: strip path separators, null bytes, control chars;
  never use the client filename as a storage key — generate
  `tenant/{tenant_id}/{uuid}.{ext}`. **Path-traversal**: reject `..`, absolute
  paths.
- **Archive-bomb guard** for any zip-based formats (DOCX/XLSX are zips): cap
  uncompressed size + entry count.
- **Malware scan** behind a `MalwareScanner` port (no-op/stub impl now,
  ClamAV-ready); quarantine status until clean.

---

## 11. Observability

- Structured logs at each stage start/end with timing.
- Prometheus metrics (extend the existing instrumentator): ingestion counter by
  status/category, stage-latency histograms, OCR-invoked counter, embedding
  batch size/throughput, retry counter, DLQ counter.
- Trace ID: reuse `request_id` from context; propagate `document_id`/`job_id`
  through the Celery task headers so worker logs correlate with the API request.
- Error categorization → `processing_failures.category`.

---

## 12. API (FastAPI, Pydantic v2, async, thin routers)

All under `/api/v1`, RBAC-guarded with `require("document:write"|"document:read")`.
| Method | Path | Purpose |
|---|---|---|
| POST | `/documents` | Upload (multipart); returns `{document_id, job_id, status}` |
| GET | `/documents` | List (paginated, tenant-scoped) |
| GET | `/documents/{id}` | Metadata + version + status |
| DELETE | `/documents/{id}` | Soft-delete + purge chunks/vectors |
| GET | `/documents/{id}/ingestion` | Current job status/stage/progress |
| GET | `/documents/{id}/ingestion/stream` | **SSE** live progress from Redis |
| GET | `/ingestion/history` | Job history (filter by status) |
| POST | `/ingestion/{job_id}/retry` | Re-enqueue a failed/dead job |
| POST | `/ingestion/{job_id}/cancel` | Cancel a running job |
| GET | `/documents/{id}/chunks` | Inspect chunks (paginated; for debugging/citation) |

DTOs separate from ORM models (Pydantic `from_attributes`). No business logic in
routers — delegate to services.

---

## 13. Definition of done

- [ ] One Alembic migration creates all Phase-3 tables/columns/indexes +
      Turkish FTS config; `make migrate` clean on a fresh DB.
- [ ] `POST /documents` → file in MinIO, `documents`+`ingestion_jobs` rows,
      Celery job enqueued; duplicate upload returns existing doc (idempotent);
      changed content creates a new `document_version`.
- [ ] Worker runs the full pipeline for each supported type; scanned PDF
      triggers OCR, native PDF does not (necessity detection verified).
- [ ] Chunks persisted with embeddings + `content_tsv` + full lineage; HNSW +
      GIN indexes present.
- [ ] Progress observable via SSE; failures retried; terminal failures land in
      DLQ + `processing_failures` + `status=failed`.
- [ ] All external systems behind ports + DI; routers thin; import-linter +
      ruff + mypy green.
- [ ] Tests: validation (allow/deny matrix), dedupe/versioning, OCR-necessity,
      each extractor (golden files), adaptive chunking boundaries + lineage,
      embedding shape, idempotent re-index, end-to-end ingest for one PDF and
      one scanned PDF. Target ~70/20/10 unit/integration/e2e.

---

## 14. Settings to add (`app/core/config.py`)
```
ocr_dpi: int = 300
ocr_necessity_char_threshold: int = 100      # chars/page below -> OCR
chunk_min_tokens: int = 256
chunk_max_tokens: int = 1024
chunk_overlap_tokens: int = 64
embed_batch_size: int = 32
max_archive_uncompressed_mb: int = 200
```

**Implementation order:** migration → documents.models/repo → UploadService +
ValidationService (start here, per Phase-3 first task) → extractors → OCR +
necessity → normalization → adaptive chunking + lineage → embedding → indexing
→ stages/task wiring → API → SSE → tests.
