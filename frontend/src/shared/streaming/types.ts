/**
 * Streaming-specific types for the chat SSE client.
 *
 * The wire-level event union (`StreamEvent`, `StreamDelta`, ...) lives in
 * `shared/types/api.ts` alongside the rest of the API contract. This module
 * re-exports it and adds handler/metadata shapes the client and hook consume.
 */

import type { CitationOut, StreamDone } from "@/shared/types/api";

export type {
  StreamEvent,
  StreamDelta,
  StreamCitation,
  StreamDone,
} from "@/shared/types/api";

/** Metadata delivered by the terminal `done` event. */
export type StreamDoneMeta = Omit<StreamDone, "type">;

/** Callbacks the SSE client invokes as the stream is parsed. */
export interface StreamHandlers {
  /** A token chunk arrived. */
  onDelta: (text: string) => void;
  /** A citation arrived (keyed downstream by `citation_number`). */
  onCitation: (citation: CitationOut) => void;
  /** The stream finished successfully with final metadata. */
  onDone: (meta: StreamDoneMeta) => void;
  /** A non-abort error occurred. Aborts resolve quietly without this firing. */
  onError: (err: import("@/shared/lib/normalizeError").NormalizedError) => void;
}
