/**
 * Ephemeral chat-stream store (NOT persisted).
 *
 * Holds ONLY live streaming state: the in-flight assistant draft, citations
 * collected during the current generation, the streaming phase, and the
 * AbortController used to stop generation. Persisted server data (messages,
 * conversations) lives in the TanStack Query cache — never mirrored here.
 *
 * Per the architecture rule: streaming text lives here during the stream, then
 * is reconciled into the Query cache for the conversation on `done`.
 */

import { create } from "zustand";
import type { CitationOut } from "@/shared/types/api";
import type { StreamDoneMeta } from "@/shared/streaming/types";

/**
 * Streaming lifecycle phase. Drives the intelligent status line:
 *   idle        → nothing happening
 *   retrieving  → request sent, no tokens yet (Belgeler getiriliyor / sıralanıyor)
 *   verifying   → citations arrived, tokens not yet flowing (Alıntılar doğrulanıyor)
 *   generating  → tokens streaming (Yanıt oluşturuluyor)
 */
export type StreamPhase = "idle" | "retrieving" | "verifying" | "generating";

export interface OptimisticUserMessage {
  /** Stable client id (used as React key until the server row replaces it). */
  clientId: string;
  content: string;
}

interface ChatStreamState {
  /** Conversation currently streaming into (null when idle). */
  conversationId: string | null;
  isStreaming: boolean;
  phase: StreamPhase;
  /** Accumulated assistant draft text for the active generation. */
  draft: string;
  /** Citations collected this generation, keyed by `citation_number`. */
  citations: Record<number, CitationOut>;
  /** Optimistic user message shown immediately before the server persists it. */
  pendingUser: OptimisticUserMessage | null;
  /** Metadata from the terminal `done` event (confidence, flags, ...). */
  doneMeta: StreamDoneMeta | null;
  /** Live abort controller for stop-generation. */
  abort: AbortController | null;

  start: (conversationId: string, pendingUser: OptimisticUserMessage, abort: AbortController) => void;
  setPhase: (phase: StreamPhase) => void;
  appendDraft: (text: string) => void;
  addCitation: (c: CitationOut) => void;
  finish: (meta: StreamDoneMeta) => void;
  reset: () => void;
}

const INITIAL = {
  conversationId: null,
  isStreaming: false,
  phase: "idle" as StreamPhase,
  draft: "",
  citations: {} as Record<number, CitationOut>,
  pendingUser: null,
  doneMeta: null,
  abort: null,
};

export const useChatStore = create<ChatStreamState>((set) => ({
  ...INITIAL,

  start: (conversationId, pendingUser, abort) =>
    set({
      conversationId,
      pendingUser,
      abort,
      isStreaming: true,
      phase: "retrieving",
      draft: "",
      citations: {},
      doneMeta: null,
    }),

  setPhase: (phase) => set({ phase }),

  // Note: deltas are rAF-batched in the hook; this just appends the batched text.
  appendDraft: (text) =>
    set((s) => ({
      draft: s.draft + text,
      // First token flowing → generating phase.
      phase: s.phase === "generating" ? s.phase : "generating",
    })),

  addCitation: (c) =>
    set((s) => ({
      citations: { ...s.citations, [c.citation_number]: c },
      // Citations before tokens → verifying (unless already generating).
      phase: s.phase === "generating" ? s.phase : "verifying",
    })),

  finish: (meta) => set({ doneMeta: meta, isStreaming: false, phase: "idle", abort: null }),

  reset: () => set({ ...INITIAL }),
}));
