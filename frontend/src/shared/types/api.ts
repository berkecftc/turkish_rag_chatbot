/**
 * Hand-written DTO contracts mirroring the backend API (Phase 0 of the plan).
 *
 * RULES:
 *  - Wire shape is SNAKE_CASE (the API sends snake_case). Do NOT camelCase.
 *  - Only fields documented in the plan's DTO list appear here — nothing invented.
 *  - Optionality (`?`) matches the plan's nullable/optional markers.
 */

import type {
  DocumentSource,
  DocumentStatus,
  EmbeddingStatus,
  JobStatus,
  IngestionStage,
  MessageRole,
} from "./enums";

// ── Auth ────────────────────────────────────────────────────────────────────
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

// ── Documents ───────────────────────────────────────────────────────────────
export interface UploadResponse {
  document_id: string;
  job_id: string;
  status: DocumentStatus;
  is_duplicate: boolean;
  version: number;
}

export interface DocumentOut {
  id: string;
  title: string;
  source_type: DocumentSource;
  status: DocumentStatus;
  mime_type: string;
  size_bytes: number;
  page_count?: number;
  language: string;
  created_at: string;
}

export interface DocumentVersionOut {
  id: string;
  document_id: string;
  version: number;
  content_hash: string;
  size_bytes: number;
  created_at: string;
}

// ── Ingestion ───────────────────────────────────────────────────────────────
export interface JobStatusOut {
  id: string;
  document_id: string;
  status: JobStatus;
  stage: IngestionStage;
  progress: number;
  attempts: number;
  error?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

export interface ChunkOut {
  id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  page?: number;
  section?: string;
  char_start?: number;
  char_end?: number;
  chunk_strategy?: string;
  embedding_status: EmbeddingStatus;
}

// ── RAG: chat / citations ───────────────────────────────────────────────────
export interface MetadataFilter {
  document_ids?: string[];
  source_types?: DocumentSource[];
  language?: string;
  date_from?: string;
  date_to?: string;
}

export interface ChatRequest {
  query: string;
  conversation_id?: string;
  filters?: MetadataFilter;
  stream: boolean;
  debug: boolean;
}

export interface CitationOut {
  id: string;
  citation_number: number;
  document_id?: string;
  document_title: string;
  text_excerpt: string;
  page_number?: number;
  section?: string;
  vector_score?: number;
  rerank_score?: number;
  combined_score?: number;
  source_reliability?: number;
}

export interface ChatResponse {
  conversation_id: string;
  message_id: string;
  content: string;
  citations: CitationOut[];
  confidence_score: number;
  retrieval_quality?: number;
  hallucination_flags: string[];
  tokens_used: number;
  latency_ms: number;
  model: string;
  cached: boolean;
}

// ── RAG: search ─────────────────────────────────────────────────────────────
export interface SearchRequest {
  query: string;
  filters?: MetadataFilter;
  top_k?: number;
  include_scores?: boolean;
}

export interface SearchResultItem {
  chunk_id: string;
  document_id: string;
  document_title: string;
  content: string;
  page?: number;
  section?: string;
  vector_score?: number;
  bm25_score?: number;
  combined_score: number;
  rerank_score?: number;
  source_reliability?: number;
}

export interface SearchResponse {
  results: SearchResultItem[];
  query_intent: string;
  rewritten_query?: string;
  latency_ms: number;
}

// ── RAG: conversations & messages ───────────────────────────────────────────
export interface ConversationCreate {
  title?: string;
}

export interface ConversationUpdate {
  title: string;
}

export interface ConversationOut {
  id: string;
  title?: string;
  summary?: string;
  total_messages: number;
  total_tokens_used: number;
  last_message_at?: string;
  created_at: string;
  updated_at: string;
}

export interface MessageOut {
  id: string;
  role: MessageRole;
  content: string;
  model?: string;
  token_count?: number;
  confidence_score?: number;
  has_citations: boolean;
  citation_count: number;
  hallucination_flags?: string[];
  created_at: string;
}

// ── RAG: retrieval debug ────────────────────────────────────────────────────
export interface ChunkDebugInfo {
  chunk_id: string;
  document_title: string;
  content_preview: string;
  page?: number;
  vector_score?: number;
  bm25_score?: number;
  combined_score: number;
  rerank_score?: number;
  token_count: number;
  included_in_context: boolean;
}

export interface DebugResponse {
  message_id: string;
  original_query: string;
  rewritten_query?: string;
  query_intent?: string;
  retrieved_chunks: ChunkDebugInfo[];
  context_tokens: number;
  was_compressed: boolean;
  vector_weight?: number;
  bm25_weight?: number;
  retrieval_latency_ms?: number;
  rerank_latency_ms?: number;
  generation_latency_ms?: number;
  total_latency_ms?: number;
  confidence_score?: number;
  cache_hit: boolean;
}

// ── SSE streaming events (POST /rag/chat/stream) ────────────────────────────
// Phase 5 owns the SSE client; these types are defined here so the contract
// lives with the rest of the API types and can be reused.
export interface StreamDelta {
  type: "delta";
  content: string;
}

export interface StreamCitation {
  type: "citation";
  citation: CitationOut;
}

export interface StreamDone {
  type: "done";
  message_id: string;
  confidence_score: number;
  tokens_used: number;
  latency_ms: number;
  cached: boolean;
  hallucination_flags: string[];
}

/** Discriminated union over the `type` field. */
export type StreamEvent = StreamDelta | StreamCitation | StreamDone;
