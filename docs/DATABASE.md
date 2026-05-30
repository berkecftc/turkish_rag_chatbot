# Database Design — Turkish RAG Platform

PostgreSQL 16 with extensions: `pgvector` (vectors + HNSW), `pg_trgm`
(fuzzy/trigram), and built-in full-text search (`tsvector`). One transactional
store for relational data, embeddings, and lexical search.

Conventions:
- All ids are `UUID` (v7-ish, time-ordered) for sortability + non-enumerability.
- Every business table carries `tenant_id` (multi-tenancy) and
  `created_at`/`updated_at` (`timestamptz`).
- Soft delete via `deleted_at` on user-facing entities; hard delete for chunks
  on re-ingest.
- Money/quotas as `bigint` (no floats). Enums as Postgres `enum` types.

---

## 1. Entity-Relationship Overview

```
tenants ──< memberships >── users ──< refresh_tokens
   │                          │
   │                          └──< api_keys
   ├──< roles >──< role_permissions >── permissions
   │      └──< membership.role_id
   │
   ├──< documents ──< document_versions
   │        │
   │        └──< chunks            (vector + tsvector)
   │
   ├──< ingestion_jobs ── documents
   │
   ├──< conversations ──< messages ──< citations >── chunks
   │
   └──< audit_logs
```

---

## 2. Core Tables (DDL)

### Extensions & enums

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE document_status   AS ENUM ('pending','processing','ready','failed','quarantined');
CREATE TYPE ingestion_stage   AS ENUM ('queued','extract','ocr','chunk','embed','index','done','error');
CREATE TYPE job_status        AS ENUM ('queued','running','succeeded','failed','retrying','dead');
CREATE TYPE message_role      AS ENUM ('user','assistant','system');
CREATE TYPE document_source   AS ENUM ('pdf','docx','xlsx','csv','image','txt');
```

### Tenancy & identity

```sql
CREATE TABLE tenants (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    slug         CITEXT UNIQUE NOT NULL,
    plan         TEXT NOT NULL DEFAULT 'free',
    quota_docs   BIGINT NOT NULL DEFAULT 1000,
    quota_tokens BIGINT NOT NULL DEFAULT 1000000,
    settings     JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,              -- Argon2id
    full_name       TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    is_superuser    BOOLEAN NOT NULL DEFAULT false,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = system role
    name        TEXT NOT NULL,                                  -- owner, admin, member, viewer
    description TEXT,
    UNIQUE (tenant_id, name)
);

CREATE TABLE permissions (
    id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code  TEXT UNIQUE NOT NULL   -- e.g. 'document:read', 'document:write', 'admin:manage_users'
);

CREATE TABLE role_permissions (
    role_id       UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE memberships (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    role_id    UUID NOT NULL REFERENCES roles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, user_id)
);

CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jti         UUID NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    user_agent  TEXT,
    ip          INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    prefix      TEXT NOT NULL,            -- shown to user
    key_hash    TEXT NOT NULL,            -- only hash stored
    scopes      TEXT[] NOT NULL DEFAULT '{}',
    last_used_at TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at  TIMESTAMPTZ
);
```

### Documents & chunks (the RAG core)

```sql
CREATE TABLE documents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    owner_id      UUID NOT NULL REFERENCES users(id),
    title         TEXT NOT NULL,
    source_type   document_source NOT NULL,
    status        document_status NOT NULL DEFAULT 'pending',
    storage_key   TEXT NOT NULL,            -- object storage path
    content_hash  TEXT NOT NULL,            -- sha256, dedupe within tenant
    size_bytes    BIGINT NOT NULL,
    mime_type     TEXT NOT NULL,
    page_count    INT,
    language      TEXT DEFAULT 'tr',
    metadata      JSONB NOT NULL DEFAULT '{}',
    error         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    UNIQUE (tenant_id, content_hash)
);
CREATE INDEX idx_documents_tenant_status ON documents (tenant_id, status) WHERE deleted_at IS NULL;

CREATE TABLE document_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version     INT NOT NULL,
    storage_key TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, version)
);

-- BGE-M3 dense dimension = 1024
CREATE TABLE chunks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index   INT NOT NULL,
    content       TEXT NOT NULL,
    token_count   INT NOT NULL,
    embedding     VECTOR(1024),                       -- dense (BGE-M3)
    content_tsv   TSVECTOR,                            -- lexical (Turkish config)
    page          INT,
    section       TEXT,
    bbox          JSONB,                               -- source highlight coords
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, chunk_index)
);

-- Dense ANN index (cosine). HNSW: high recall, fast queries.
CREATE INDEX idx_chunks_embedding_hnsw
    ON chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Lexical / hybrid
CREATE INDEX idx_chunks_tsv ON chunks USING gin (content_tsv);
CREATE INDEX idx_chunks_trgm ON chunks USING gin (content gin_trgm_ops);

-- Tenant-scoped filtering (pushed into ANN prefilter)
CREATE INDEX idx_chunks_tenant_doc ON chunks (tenant_id, document_id);
```

> **Turkish full-text note:** Postgres ships no `turkish` text-search config by
> default. We register a custom config (unaccent + Snowball/`simple` +
> synonym/stopword dictionaries) at migration time and populate `content_tsv`
> with it. Trigram (`pg_trgm`) complements this for typo/morphology tolerance.

### Ingestion jobs

```sql
CREATE TABLE ingestion_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    status        job_status NOT NULL DEFAULT 'queued',
    stage         ingestion_stage NOT NULL DEFAULT 'queued',
    progress      INT NOT NULL DEFAULT 0,         -- 0..100
    attempts      INT NOT NULL DEFAULT 0,
    max_attempts  INT NOT NULL DEFAULT 3,
    error         TEXT,
    celery_task_id TEXT,
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_tenant_status ON ingestion_jobs (tenant_id, status);
```

### Conversations, messages, citations (RAG output)

```sql
CREATE TABLE conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id),
    title       TEXT,
    summary     TEXT,                       -- running memory summary
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            message_role NOT NULL,
    content         TEXT NOT NULL,
    tokens_in       INT,
    tokens_out      INT,
    model           TEXT,
    latency_ms      INT,
    rewritten_query TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);

CREATE TABLE citations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    chunk_id    UUID NOT NULL REFERENCES chunks(id),
    document_id UUID NOT NULL REFERENCES documents(id),
    rank        INT NOT NULL,
    score       REAL,                       -- rerank score
    page        INT,
    bbox        JSONB,                       -- highlight coords for the viewer
    snippet     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_citations_message ON citations (message_id, rank);
```

### Audit (append-only)

```sql
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID,
    actor_id    UUID,                        -- user or NULL (system)
    action      TEXT NOT NULL,               -- 'auth.login', 'document.delete', 'rbac.deny', 'rag.query'
    resource    TEXT,                        -- 'document:<id>'
    ip          INET,
    user_agent  TEXT,
    severity    TEXT NOT NULL DEFAULT 'info',-- info|warning|security
    payload     JSONB NOT NULL DEFAULT '{}', -- no PII / no document content
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_time ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_action_time ON audit_logs (action, created_at DESC);
```

---

## 3. Hybrid Retrieval Query (reference)

Dense + lexical fused with Reciprocal Rank Fusion, tenant- and ACL-filtered:

```sql
WITH dense AS (
    SELECT id, 1.0 / (60 + row_number() OVER (ORDER BY embedding <=> :qvec)) AS rrf
    FROM chunks
    WHERE tenant_id = :tenant AND document_id = ANY(:allowed_docs)
    ORDER BY embedding <=> :qvec
    LIMIT 50
),
lexical AS (
    SELECT id, 1.0 / (60 + row_number() OVER (ORDER BY ts_rank(content_tsv, query) DESC)) AS rrf
    FROM chunks, plainto_tsquery('turkish_custom', :qtext) query
    WHERE tenant_id = :tenant AND document_id = ANY(:allowed_docs)
      AND content_tsv @@ query
    LIMIT 50
)
SELECT c.*, COALESCE(d.rrf,0) + COALESCE(l.rrf,0) AS score
FROM chunks c
LEFT JOIN dense d ON d.id = c.id
LEFT JOIN lexical l ON l.id = c.id
WHERE d.id IS NOT NULL OR l.id IS NOT NULL
ORDER BY score DESC
LIMIT 25;   -- then cross-encoder rerank → top 5..8
```

---

## 4. Indexing & Scaling Notes

- **HNSW** chosen over IVFFlat: no training step, better recall at query time,
  handles incremental inserts (continuous ingestion). Tune `ef_search` per query
  for the recall/latency trade-off.
- **Partitioning:** when `chunks` grows large, partition by `tenant_id` (hash)
  or by `document_id` range; HNSW indexes are per-partition.
- **Read replicas** for the query path; primary for ingestion writes.
- **Vacuum/maintenance:** monitor index bloat on `chunks`; `content_tsv` is a
  generated/maintained column updated on chunk write.
- **Backups:** logical (`pg_dump`) for schema + PITR (WAL archiving) for prod.
- **Migrations:** Alembic, forward-only in prod, tested in CI against a real
  Postgres (see ROADMAP — "83% of migrations fail without tests").

---

## 5. Row-Level Security (defense in depth)

```sql
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON documents
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

The app sets `SET LOCAL app.tenant_id = '<uuid>'` at the start of each
request/transaction (via the DB session dependency). Even if an application
query forgets its `WHERE tenant_id`, RLS prevents cross-tenant leakage. Applied
to all tenant-scoped tables.
