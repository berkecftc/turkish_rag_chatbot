/**
 * TypeScript mirrors of the backend `str, Enum` types. The WIRE VALUES below are
 * copied VERBATIM from the backend models — the API serializes each enum by its
 * `.value`, so these literals must match exactly.
 *
 * Sources:
 *  - backend/app/modules/documents/models.py  → DocumentSource, DocumentStatus
 *  - backend/app/modules/ingestion/models.py   → JobStatus, IngestionStage, EmbeddingStatus
 *  - backend/app/modules/rag/models.py         → MessageRole
 *
 * Each enum exposes both a string-literal union type AND a runtime array of all
 * members (for iteration / dropdowns / validation).
 */

// ── DocumentSource ──────────────────────────────────────────────────────────
export type DocumentSource = "pdf" | "docx" | "xlsx" | "csv" | "image" | "txt";

export const DOCUMENT_SOURCES = [
  "pdf",
  "docx",
  "xlsx",
  "csv",
  "image",
  "txt",
] as const satisfies readonly DocumentSource[];

// ── DocumentStatus ──────────────────────────────────────────────────────────
export type DocumentStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "quarantined";

export const DOCUMENT_STATUSES = [
  "pending",
  "processing",
  "ready",
  "failed",
  "quarantined",
] as const satisfies readonly DocumentStatus[];

// ── JobStatus ───────────────────────────────────────────────────────────────
export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "retrying"
  | "dead";

export const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "retrying",
  "dead",
] as const satisfies readonly JobStatus[];

/**
 * Terminal job states — polling should stop once a job reaches one of these.
 * `succeeded` and `failed` are the canonical terminal outcomes; `dead` is a
 * terminal exhausted-retries state and is included so polling never hangs.
 */
export const TERMINAL_JOB_STATUSES = [
  "succeeded",
  "failed",
  "dead",
] as const satisfies readonly JobStatus[];

export function isTerminalJobStatus(status: JobStatus): boolean {
  return (TERMINAL_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

// ── IngestionStage ──────────────────────────────────────────────────────────
export type IngestionStage =
  | "queued"
  | "extract"
  | "ocr"
  | "chunk"
  | "embed"
  | "index"
  | "done"
  | "error";

export const INGESTION_STAGES = [
  "queued",
  "extract",
  "ocr",
  "chunk",
  "embed",
  "index",
  "done",
  "error",
] as const satisfies readonly IngestionStage[];

// ── EmbeddingStatus ─────────────────────────────────────────────────────────
export type EmbeddingStatus = "pending" | "embedded" | "failed";

export const EMBEDDING_STATUSES = [
  "pending",
  "embedded",
  "failed",
] as const satisfies readonly EmbeddingStatus[];

// ── MessageRole ─────────────────────────────────────────────────────────────
export type MessageRole = "user" | "assistant" | "system";

export const MESSAGE_ROLES = [
  "user",
  "assistant",
  "system",
] as const satisfies readonly MessageRole[];
