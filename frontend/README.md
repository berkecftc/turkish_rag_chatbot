# Turkish AI Document Intelligence — Frontend

Premium enterprise AI workspace frontend for the Turkish RAG platform. Not a chatbot — a document-intelligence workspace with streaming chat, Perplexity-style inline citations, retrieval transparency, and an analytics/admin surface.

## Stack
React 18 · Vite 6 · TypeScript (strict) · TailwindCSS · dependency-free shadcn-style primitives · TanStack Query · Zustand · React Router · Framer Motion · recharts · react-markdown · react-dropzone · react-hook-form + zod.

## Run
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxies /api -> http://localhost:8000)
npm run build      # tsc --noEmit && vite build
npm run typecheck
```
Backend must be running on `:8000` (see repo root `docker-compose.yml`).

## Architecture
- **Server state** → TanStack Query (documents, jobs, conversations, messages, search, debug, health). Query keys centralized in `src/shared/lib/queryKeys.ts`.
- **Client/UI state** → Zustand: `auth` (persisted tokens), `ui` (sidebar/theme), `chat` (ephemeral stream buffer), `preferences` (persisted chat prefs).
- **API layer** → axios instance `src/lib/api.ts` with single-flight 401→refresh and additive latency telemetry. Feature `api.ts` modules expose typed hooks.
- **Streaming** → `src/shared/streaming/sseClient.ts` uses `fetch` + `ReadableStream` (NOT EventSource — POST + bearer), with AbortController stop and 401 refresh-retry.
- **RBAC** → permission-based via JWT `perms[]` (`usePermissions()`), no role field. `/admin` route gated by `RequirePermission`.
- **Routing** → lazy/code-split per page, route-level error boundaries.

```
src/
  app/          shell: providers, router, layouts, ProtectedRoute, ErrorBoundary, CommandPalette
  features/     auth chat documents upload search retrieval dashboard analytics admin settings conversations
  components/   ui/ (primitives) + composite (PageHeader, EmptyState, ConfirmDialog, ScoreBars, ...)
  shared/       streaming/ hooks/ lib/ (jwt, format, normalizeError, motion) analytics/ types/
  stores/       auth ui chat preferences
  i18n/         Turkish nav + enum labels
  styles/       token-based theme (light/dark)
```

## Honesty / data provenance
The backend exposes auth, documents, ingestion, RAG (chat/stream/search/conversations/debug), health, and metrics — see `docs/frontend/PLAN.md` Phase 0 for the exact contract. There are **no** analytics/admin-user/audit/register/logout/me/version/delete-conversation endpoints. Where the UI shows data those endpoints would provide, it is **clearly labeled "Örnek veri"** (sample) behind a swappable adapter and never presented as real telemetry. Real-derived metrics are labeled "Gerçek veri".

## Key UX
- **Chat**: token streaming with rAF-batched rendering, staged status line (belge getirme → yeniden sıralama → alıntı doğrulama → yanıt üretme), markdown + code copy, inline `[n]` citation chips with source-preview popovers + score bars, confidence meter + hallucination flags, follow-ups, stop-generation.
- **Retrieval inspector** (`/retrieval/:messageId`): hybrid weights, latency breakdown, context/token allocation, sortable chunk debug table, per-column-normalized score heatmap.
- **Upload**: drag-drop, live progress, ingestion stage stepper with OCR state and retry.
- **Accessibility**: skip link, landmarks, focus rings, `prefers-reduced-motion`, keyboard nav, aria labels. **Responsive** desktop/tablet/mobile throughout.

Full phased build log and contracts: [`../docs/frontend/PLAN.md`](../docs/frontend/PLAN.md).
