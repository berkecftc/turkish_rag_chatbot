# Frontend Implementation Plan — Turkish AI Document Intelligence Platform

> Enterprise AI workspace frontend. React + Vite + TS + Tailwind + shadcn/ui + TanStack Query + Zustand + React Router + Framer Motion.
> Authored as a phased, LLM-executable plan. Each phase is self-contained and ends with a verification checklist.

---

## Phase 0 — Documentation Discovery (DONE — grounding facts)

These are the **real** backend contracts. Do not invent endpoints. Anything not listed here does **not** exist server-side yet.

### API base & auth
- Base URL: `/api/v1` (Vite proxies `/api` → `http://localhost:8000`).
- Auth: `Authorization: Bearer <access_token>`. JWT access claims: `sub` (user_id), `tid` (tenant_id), `jti`, `perms: string[]`, `type: "access"`.
- **RBAC is permission-based, not role-based.** Decode `perms[]` from the JWT for role-aware UI. There is no `role` field.

### Allowed endpoints (exact)
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | body `{email, password}` → `TokenPair {access_token, refresh_token, token_type}` |
| POST | `/auth/refresh` | body `{refresh_token}` → `TokenPair` |
| POST | `/documents/upload` | multipart `file` → `202 UploadResponse {document_id, job_id, status, is_duplicate, version}` |
| GET | `/documents?limit&offset` | → `DocumentOut[]` |
| GET | `/documents/{id}` | → `DocumentOut` |
| DELETE | `/documents/{id}` | → `204` |
| GET | `/ingestion/jobs?job_status&limit&offset` | → `JobStatusOut[]` |
| GET | `/ingestion/jobs/{id}` | → `JobStatusOut {status, stage, progress, attempts, error, ...}` |
| GET | `/ingestion/documents/{id}/chunks?limit&offset` | → `ChunkOut[]` |
| POST | `/ingestion/jobs/{id}/retry` | → `202 JobStatusOut` |
| POST | `/rag/chat` | body `ChatRequest` → `ChatResponse` (non-stream) |
| POST | `/rag/chat/stream` | body `ChatRequest` → SSE stream (see below) |
| POST | `/rag/search` | body `SearchRequest` → `SearchResponse` |
| POST | `/rag/conversations` | body `{title?}` → `201 ConversationOut` |
| GET | `/rag/conversations?limit&offset` | → `ConversationOut[]` |
| GET | `/rag/conversations/{id}/messages?limit&offset` | → `MessageOut[]` |
| GET | `/rag/debug/{message_id}` | → `DebugResponse` |
| GET | `/health/live`, `/health/ready` | liveness/readiness |
| GET | `/metrics` | Prometheus text (not JSON) |

### SSE streaming contract (`POST /rag/chat/stream`)
- `Content-Type: text/event-stream`. Each line: `data: <json>\n\n`.
- Event JSON shapes (discriminated by `type`):
  - `{ "type": "delta", "content": "<token chunk>" }`
  - `{ "type": "citation", "citation": CitationOut }`
  - `{ "type": "done", "message_id, confidence_score, tokens_used, latency_ms, cached, hallucination_flags[] }`
- Terminates with literal `data: [DONE]`.
- **POST + bearer → must use `fetch` + `ReadableStream` reader, NOT `EventSource`** (EventSource is GET-only and can't set Authorization headers).

### Key response types (copy verbatim into TS types)
- `ChatRequest { query, conversation_id?, filters?: MetadataFilter, stream, debug }`
- `MetadataFilter { document_ids?, source_types?, language?, date_from?, date_to? }`
- `ChatResponse { conversation_id, message_id, content, citations: CitationOut[], confidence_score, retrieval_quality?, hallucination_flags[], tokens_used, latency_ms, model, cached }`
- `CitationOut { id, citation_number, document_id?, document_title, text_excerpt, page_number?, section?, vector_score?, rerank_score?, combined_score?, source_reliability? }`
- `SearchRequest { query, filters?, top_k=10, include_scores=true }`
- `SearchResponse { results: SearchResultItem[], query_intent, rewritten_query?, latency_ms }`
- `SearchResultItem { chunk_id, document_id, document_title, content, page?, section?, vector_score?, bm25_score?, combined_score, rerank_score?, source_reliability? }`
- `ConversationOut { id, title?, summary?, total_messages, total_tokens_used, last_message_at?, created_at, updated_at }`
- `MessageOut { id, role, content, model?, token_count?, confidence_score?, has_citations, citation_count, hallucination_flags?, created_at }`
- `DebugResponse { message_id, original_query, rewritten_query?, query_intent?, retrieved_chunks: ChunkDebugInfo[], context_tokens, was_compressed, vector_weight?, bm25_weight?, retrieval_latency_ms?, rerank_latency_ms?, generation_latency_ms?, total_latency_ms?, confidence_score?, cache_hit }`
- `ChunkDebugInfo { chunk_id, document_title, content_preview, page?, vector_score?, bm25_score?, combined_score, rerank_score?, token_count, included_in_context }`
- `DocumentOut { id, title, source_type, status, mime_type, size_bytes, page_count?, language, created_at }`
- `JobStatusOut { id, document_id, status, stage, progress, attempts, error?, created_at, started_at?, finished_at? }`
- `ChunkOut { id, chunk_index, content, token_count, page?, section?, char_start?, char_end?, chunk_strategy?, embedding_status }`

### Enums (mirror exactly; source: backend models)
- `DocumentStatus`, `DocumentSource`, `JobStatus`, `IngestionStage`, `EmbeddingStatus`, `MessageRole`. **Verify exact members by reading `backend/app/modules/*/models.py` before coding** (Phase 4/5 reads them). Render labels via a Turkish label map, never hardcode.

### Anti-patterns to avoid
- ❌ `EventSource` for the stream (GET-only, no auth header). Use `fetch` + reader.
- ❌ Inventing `/admin/*`, `/analytics/*`, `/auth/register`, `/auth/logout`, conversation delete, document download — they don't exist. Admin/Analytics run on existing surfaces + a clearly-marked mock adapter swappable later.
- ❌ Assuming a `role` claim. Use `perms[]`.
- ❌ Hardcoding Turkish strings in components. Centralize in label maps / `i18n` constants.

### Existing scaffold (keep & extend, don't rewrite from zero)
`frontend/` already has: Vite+TS config, Tailwind w/ HSL CSS-var theme + dark mode, `src/lib/api.ts` (axios + single-flight refresh interceptor — **keep**), `src/lib/queryClient.ts`, `src/stores/auth.ts` (persisted Zustand), `src/app/{router,AppLayout,ProtectedRoute}.tsx`, placeholder feature pages. Build script: `tsc --noEmit && vite build`. Path alias `@/*`.

---

## Architecture Overview (target)

```
frontend/src/
  app/                  # shell: router, layouts, providers, error boundaries
    providers/          # QueryProvider, ThemeProvider, ToastProvider, MotionConfig
    layouts/            # AppLayout (sidebar+topbar), AuthLayout, FullBleedLayout
    router.tsx          # lazy routes + code-splitting
    ProtectedRoute.tsx  # auth + permission gating
    ErrorBoundary.tsx   # route-level boundary + fallback
  features/             # feature-based vertical slices
    auth/               # login, session, useAuth hooks, permission helpers
    chat/               # ChatPage, MessageList, Composer, streaming renderer, citations
    documents/          # explorer, table, detail drawer, version/chunk views
    upload/             # dropzone center, ingestion tracker
    search/             # semantic search + result cards w/ scores
    dashboard/          # workspace overview
    retrieval/          # retrieval debug / transparency inspector
    analytics/          # recharts dashboards
    admin/              # users/roles/audit/system health (perm-gated)
    settings/           # profile, appearance, model prefs
    conversations/      # history list + restore
  components/ui/        # shadcn primitives (Button, Card, Dialog, ...)
  components/           # shared composite components (PageHeader, EmptyState, ...)
  shared/
    hooks/              # useMediaQuery, useDebounce, useStreamingChat, useIntersection
    streaming/          # sseClient (fetch reader + parser), event types
    lib/                # api (axios), queryClient, utils, cn, format, jwt decode
    analytics/          # frontend observability (errors, latency, interactions)
    types/              # generated/handwritten API DTO types + enums + label maps
  stores/               # zustand: auth (exists), ui (theme/sidebar), chat (draft/stream)
  styles/               # index.css tokens, motion tokens
  i18n/                 # tr labels for enums + UI copy
```

### State boundaries
- **TanStack Query** = server state (documents, jobs, conversations, messages, search, debug). Source of truth for anything fetched.
- **Zustand** = client/UI state only: auth tokens (persisted), theme + sidebar (persisted), live chat stream buffer (ephemeral), command-palette open state.
- **Never** mirror server data into Zustand. Streaming text lives in a ref/local state during stream, then is reconciled into the Query cache for that conversation on `done`.

### Caching / invalidation strategy
- Query keys: `['documents', {limit,offset}]`, `['document', id]`, `['jobs', {status}]`, `['job', id]`, `['conversations']`, `['messages', convId]`, `['search', body]`, `['debug', messageId]`.
- `staleTime` defaults 30s (already set). Jobs in non-terminal state → `refetchInterval` polling (2–3s) until terminal, then stop.
- After upload → invalidate `['documents']` + `['jobs']`. After chat `done` → invalidate `['messages', convId]` + `['conversations']`.
- Optimistic updates: send user message → optimistically append to `['messages', convId]`; on error, roll back + surface toast.

### API layer
- Keep axios instance + refresh interceptor (`lib/api.ts`). Add typed resource modules (`features/*/api.ts`) returning DTOs.
- Streaming bypasses axios: dedicated `shared/streaming/sseClient.ts` using `fetch` with `AbortController` (cancellation), bearer header from `useAuth`, manual 401→refresh→retry once.
- Error normalization: one `normalizeError(e)` → `{ code, message, status, retriable }`. All UIs consume the normalized shape.

---

## Phase 1 — Design System & Tokens

**Goal:** Vercel/Linear-grade visual foundation before any feature UI.

**Implement (copy patterns from existing `index.css` HSL var approach, extend it):**
1. Expand `src/styles/index.css` token set: add `card`, `popover`, `secondary`, `destructive`, `success`, `warning`, `info`, `ring`, plus confidence scale (`--confidence-high/med/low`) and chart palette (`--chart-1..6`). Light + dark.
2. Extend `tailwind.config.js`: map all new colors, add `fontFamily` (Inter / Geist-like sans + mono), typography scale, `boxShadow` (subtle elevation), `keyframes` + `animation` (shimmer, fade-in, slide-up, caret-blink), container query breakpoints.
3. Install + init shadcn/ui primitives needed: `button, card, dialog, drawer/sheet, dropdown-menu, tooltip, tabs, badge, input, textarea, scroll-area, separator, skeleton, sonner (toast), popover, avatar, command, progress, table, select, switch`.
4. Motion tokens: `shared/lib/motion.ts` — standard transitions (ease, duration) + Framer variants (fadeUp, stagger, streamCaret).
5. Theme: `ThemeProvider` (class on `<html>`, persisted in `ui` store, respects `prefers-color-scheme`).
6. Primitives library: `PageHeader`, `EmptyState`, `ErrorState`, `LoadingState`, `StatCard`, `Kbd`, `ConfidenceBadge`, skeleton variants.

**Docs to follow:** shadcn/ui component patterns; existing HSL-var theme in `frontend/src/index.css`.

**Verification:**
- [ ] `npm run typecheck` clean.
- [ ] Toggle dark mode flips all tokens; no hardcoded hex in components.
- [ ] Storybook-less smoke: a `/styleguide` dev route renders every primitive in both themes.
- [ ] Contrast: text/background ≥ 4.5:1 (spot-check via tooling).

---

## Phase 2 — App Shell, Providers, Routing, Error Boundaries

**Goal:** Robust shell with code-split routes, providers, boundaries, responsive nav.

**Implement:**
1. `app/providers/` — compose QueryClientProvider, ThemeProvider, TooltipProvider, Toaster, Framer `MotionConfig`. `main.tsx` renders `<Providers><RouterProvider/></Providers>`.
2. `app/ErrorBoundary.tsx` — class boundary with reset; wrap each route element. Reports to `shared/analytics`.
3. `router.tsx` — convert to `React.lazy` + `Suspense` per page (code splitting). Keep nested `ProtectedRoute → AppLayout`. Add routes: `/`, `/chat`, `/chat/:conversationId`, `/documents`, `/documents/:id`, `/upload`, `/search`, `/retrieval/:messageId`, `/analytics`, `/admin`, `/settings`, `/conversations`, `*` (404).
4. `app/layouts/AppLayout.tsx` — upgrade existing: collapsible sidebar (persisted), top bar (breadcrumb, theme toggle, command-palette trigger `⌘K`, user menu), responsive: sidebar → sheet drawer on mobile (`useMediaQuery`). Keep Turkish nav labels via i18n map.
5. `app/CommandPalette.tsx` — `cmdk` (shadcn `command`) for navigation + quick actions.
6. `ProtectedRoute.tsx` — extend: redirect unauth → `/login`; add `<RequirePermission perm>` wrapper for admin routes using decoded `perms[]`.
7. `shared/lib/jwt.ts` — decode access token → `{ sub, tid, perms }` (no verify; display only).

**Verification:**
- [ ] Routes lazy-load (network shows chunk per page).
- [ ] Unauthed access to any protected route → `/login`.
- [ ] Mobile (≤768px) sidebar collapses to drawer; keyboard `⌘K` opens palette.
- [ ] Throwing in a page shows boundary fallback, not white screen.

---

## Phase 3 — Auth Experience

**Goal:** Login + session lifecycle. (No register/logout endpoints — handle accordingly.)

**Implement:**
1. `features/auth/api.ts` — `login(email,password)`, `refresh()` typed against `TokenPair`.
2. `LoginPage` — `react-hook-form` + `zod` validation, AuthLayout (split hero / form), loading + error states, Turkish copy. On success: `setTokens`, navigate to intended route.
3. Session: keep persisted `useAuth`. Add `logout()` = clear tokens + Query cache + redirect (client-side only, since no server logout). Add `usePermissions()` hook reading decoded JWT.
4. Register: since `/auth/register` isn't mounted, render a "contact admin" state OR wire to it only if backend later exposes it — gate behind a feature flag, do not fake success.
5. 401 handling already in axios interceptor; ensure streaming client mirrors it.

**Verification:**
- [ ] Invalid creds → inline error, no crash.
- [ ] Successful login persists across reload.
- [ ] Expired access token auto-refreshes on next call (interceptor) and on stream.
- [ ] `usePermissions().has('x')` drives admin nav visibility.

---

## Phase 4 — Typed API Layer, Types & i18n Enums

**Goal:** One typed contract surface; Turkish labels for all enums.

**Implement (read `backend/app/modules/*/models.py` for exact enum members FIRST):**
1. `shared/types/api.ts` — hand-write all DTOs from Phase 0 list.
2. `shared/types/enums.ts` — mirror `DocumentStatus/Source`, `JobStatus`, `IngestionStage`, `EmbeddingStatus`, `MessageRole` exactly.
3. `i18n/labels.ts` — Turkish label + semantic color per enum value (e.g. `JobStatus.FAILED → {label:'Başarısız', tone:'destructive'}`).
4. `shared/lib/normalizeError.ts`, `shared/lib/format.ts` (bytes, dates `tr-TR`, percentages, latency).
5. Feature `api.ts` modules: `documents`, `ingestion`, `rag`, `search` — typed axios calls + query/mutation hooks (`useDocuments`, `useUploadDocument`, `useJob`, `useConversations`, `useMessages`, `useSearch`, `useDebug`).

**Verification:**
- [ ] Enum members match backend (grep models.py). No typo'd statuses.
- [ ] All hooks typed end-to-end; `npm run typecheck` clean.

---

## Phase 5 — Chat Experience + Streaming Renderer + Citations (CORE)

**Goal:** Perplexity/ChatGPT-grade chat with token streaming, inline expandable citations, confidence, follow-ups.

**Implement:**
1. `shared/streaming/sseClient.ts` — `streamChat(body, {onDelta, onCitation, onDone, signal})` using `fetch('/api/v1/rag/chat/stream', { method:'POST', headers:{Authorization, 'Content-Type':'application/json'}, body, signal })`, read `response.body.getReader()`, decode, split on `\n\n`, strip `data: `, ignore `[DONE]`, `JSON.parse`, dispatch by `type`. Handle 401 → refresh once → retry. `AbortController` for stop-generation.
2. `features/chat/hooks/useStreamingChat.ts` — orchestrates: optimistic user message → open stream → accumulate delta into local buffer (rAF-batched for smooth render) → collect citations → on `done` reconcile into Query cache + invalidate messages/conversations.
3. `ChatPage` layout: conversation rail (left, from `/conversations`), message thread (center), optional context panel (right). Responsive: rails collapse on mobile.
4. `MessageList` + `Message` — markdown via `react-markdown` (+ remark-gfm), code blocks with copy button + syntax highlight, GitHub-style. Virtualize long threads (`react-window`) — optional, behind length threshold.
5. **Inline citations (Perplexity-style):** post-process assistant markdown to render `[n]` tokens as clickable `<CitationChip>`; hover/focus → `<SourcePreviewPopover>` (document_title, page, excerpt, scores); click → opens source drawer / navigates to retrieval view. Citations sourced from stream `citation` events keyed by `citation_number`.
6. **Confidence visualization:** `<ConfidenceMeter>` on each assistant message from `confidence_score` (0–1) — segmented bar + tone (high/med/low) + tooltip explaining retrieval_quality; surface `hallucination_flags` as a warning chip when present.
7. **Intelligent loading states:** staged status line during stream lifecycle — `Belgeler getiriliyor → Yeniden sıralanıyor → Alıntılar doğrulanıyor → Yanıt oluşturuluyor`. Drive from stream phases (delta start) + animated shimmer; typing/caret indicator while streaming.
8. **Composer:** auto-grow textarea, `⏎` send / `⇧⏎` newline, attach-filter (document_ids via `MetadataFilter`), stop button (abort), disabled/streaming states.
9. **Follow-up suggestions:** render after `done` (derive from query_intent/heuristic or static starters — mark clearly as client-side until backend provides them).
10. `useChatStore` (Zustand) — current streaming buffer, isStreaming, abort ref. Ephemeral only.

**Docs to follow:** SSE contract (Phase 0); `react-markdown` + `remark-gfm`; existing `useAuth` for token.

**Verification:**
- [ ] Tokens render progressively & smoothly (no layout thrash); caret blinks.
- [ ] `[n]` chips clickable; popover shows source + scores; keyboard-accessible.
- [ ] Confidence meter + hallucination chip render from real fields.
- [ ] Stop button aborts the fetch stream mid-generation.
- [ ] 401 during stream silently refreshes & resumes.
- [ ] New conversation auto-created when `conversation_id` absent; thread persists after reload (from `/messages`).
- [ ] Mobile: thread usable, rails collapse.

---

## Phase 6 — Document Upload Center + Ingestion Tracking

**Goal:** Drag-drop upload with live ingestion/OCR status.

**Implement:**
1. `UploadPage` — `react-dropzone` multi-file, type/size validation (PDF, DOCX, XLSX, CSV, PNG, JPG), per-file upload via `useUploadDocument` (axios `onUploadProgress`), `is_duplicate`/`version` surfaced.
2. **Ingestion tracker:** after 202, poll `useJob(job_id)` with `refetchInterval` until terminal; render stage stepper (`IngestionStage`) + `progress` bar + OCR sub-state + retry button (`/ingestion/jobs/{id}/retry`) on failure with `error` shown.
3. Empty/skeleton/error states; toasts on success/failure.

**Verification:**
- [ ] Drag-drop + click upload both work; invalid types rejected with message.
- [ ] Progress bar reflects upload then ingestion stages live.
- [ ] Failed job shows error + working retry.
- [ ] Duplicate upload surfaces `is_duplicate` cleanly.

---

## Phase 7 — Document Explorer + Detail

**Implement:** sortable/filterable table (`DocumentOut`), status badges (i18n), search box (client filter), detail route `/documents/:id` (drawer or page) with metadata, chunks (`/ingestion/documents/{id}/chunks`, paginated/virtualized), delete (confirm dialog → `204` → invalidate). Version display from `version` where available. Loading skeletons, empty state.

**Verification:** list paginates; detail loads chunks; delete confirms + removes; mobile table → card list.

---

## Phase 8 — Semantic Search

**Implement:** `SearchPage` querying `/rag/search`; result cards = `SearchResultItem` with document title, excerpt, page/section, and **score visualization** (vector / bm25 / combined / rerank / reliability as mini bars). Show `query_intent` + `rewritten_query` (query understanding panel). `top_k` control, filters. Debounced input, loading skeletons, empty state.

**Verification:** results render with scores; rewritten query shown; latency displayed; empty query handled.

---

## Phase 9 — Retrieval Transparency / Debug Inspector

**Goal:** Pro AI-engineering tool feel.

**Implement:** `/retrieval/:messageId` from `/rag/debug/{message_id}` (`DebugResponse`). Panels: query understanding (original→rewritten, intent), retrieved chunks table (`ChunkDebugInfo`: scores, token_count, `included_in_context` highlight), score **heatmap** (recharts/custom), hybrid weight viz (`vector_weight`/`bm25_weight`), context-assembly + token-allocation bar (`context_tokens`, `was_compressed`), latency breakdown (retrieval/rerank/generation/total), cache_hit + confidence. Link from each assistant message ("Kaynakları incele").

**Verification:** debug loads for a real message id; chunks sorted by score; included-in-context visually distinct; latency + weights render.

---

## Phase 10 — Workspace Dashboard

**Implement:** `/` overview — stat cards (document count, conversations, recent jobs, ingestion health) from existing list endpoints; recent conversations; recent uploads w/ status; quick actions (new chat, upload). Skeletons + empty states. No new backend needed.

**Verification:** cards reflect real counts; quick actions route correctly; responsive grid.

---

## Phase 11 — Analytics Dashboard (recharts)

**Goal:** Metrics UI. **No analytics endpoint exists** → build behind `features/analytics/api.ts` adapter with two impls: (a) derived-from-real (ingestion success rate from `/ingestion/jobs`, confidence distribution from messages, cache hit from chat responses) and (b) clearly-labeled `mockAnalytics` for token usage / latency trends. Adapter swappable when backend ships endpoints. **Label mock data as "örnek veri" in UI.**

**Implement:** recharts: token usage over time, retrieval latency, ingestion success rate, confidence distribution, cache hit rate, activity. Interactive tooltips, time-range selector, skeleton loaders, responsive.

**Verification:** charts render in both themes; mock vs real clearly distinguished; no fake "live" claims.

---

## Phase 12 — Admin Panel (permission-gated)

**Implement:** route guarded by `RequirePermission`. **No admin endpoints** → users/roles/audit/system-health use: system health from `/health/ready` + `/metrics` (parse Prometheus text or show raw), ingestion monitoring from `/ingestion/jobs`, and mock adapters (labeled) for user/role/audit until backend exists. Build the UI shells so wiring is drop-in later.

**Verification:** non-permitted user can't see/reach admin; health reflects real `/health/ready`; mock sections labeled.

---

## Phase 13 — Settings, Conversation History, Observability, A11y/Perf pass

**Implement:**
1. `SettingsPage` — profile (from JWT/me — note no `/me` endpoint, show decoded claims), appearance (theme), model/chat prefs (client-persisted), about.
2. `ConversationsPage` — full history list, search, open/restore, (no delete endpoint — hide or client-archive only).
3. `shared/analytics` — frontend observability: window error + unhandledrejection capture, API latency timing (axios interceptor), stream interruption events, basic interaction + web-vitals; pluggable sink (console now, swappable).
4. A11y sweep: keyboard nav across all interactive elements, focus rings, aria labels/roles, semantic landmarks, screen-reader labels, skip-link, reduced-motion respect.
5. Perf sweep: confirm route code-splitting, memoize hot lists, virtualize long lists, lazy heavy charts, image/asset hygiene.

**Verification:** keyboard-only run-through of core flows; reduced-motion disables animations; Lighthouse a11y ≥ 90; bundle split per route.

---

## Final Phase — Verification

- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] No invented endpoints (grep for `/admin/`, `/analytics/`, `EventSource`, `/auth/register`, `/auth/logout` → only allowed usages).
- [ ] All enum labels match `backend/app/modules/*/models.py`.
- [ ] Core flows manually verified against running backend (login → upload → ingest → chat stream w/ citations → debug → search).
- [ ] Dark mode, mobile, keyboard nav all functional.
- [ ] Mock/derived data clearly labeled; nothing fakes server truth.

---

## Suggested execution order (dependency-aware)
1 → 2 → 4 → 3 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → Final.
(Design system & shell first; API/types before features; **Chat (5) is the centerpiece** — do it early after foundations.)
