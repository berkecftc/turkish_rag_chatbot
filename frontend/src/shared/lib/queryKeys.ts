/**
 * Centralized TanStack Query keys. Import from here everywhere so cache
 * invalidation stays consistent.
 *
 * Key shapes (exactly as the plan specifies):
 *   ['documents', {limit, offset}]
 *   ['document', id]
 *   ['jobs', {status}]
 *   ['job', id]
 *   ['conversations']
 *   ['messages', convId]
 *   ['search', body]
 *   ['debug', messageId]
 */

import type { JobStatus } from "@/shared/types/enums";
import type { SearchRequest } from "@/shared/types/api";

export interface ListParams {
  limit?: number;
  offset?: number;
}

export const queryKeys = {
  me: () => ["me"] as const,

  documents: (params: ListParams = {}) => ["documents", params] as const,
  document: (id: string) => ["document", id] as const,

  jobs: (params: { status?: JobStatus } = {}) => ["jobs", params] as const,
  job: (id: string) => ["job", id] as const,

  documentChunks: (documentId: string, params: ListParams = {}) =>
    ["document-chunks", documentId, params] as const,

  conversations: () => ["conversations"] as const,
  messages: (conversationId: string) => ["messages", conversationId] as const,

  search: (body: SearchRequest) => ["search", body] as const,
  debug: (messageId: string) => ["debug", messageId] as const,
} as const;

/** Root keys for broad invalidation (e.g. after a mutation). */
export const queryKeyRoots = {
  documents: ["documents"] as const,
  jobs: ["jobs"] as const,
  conversations: ["conversations"] as const,
} as const;
