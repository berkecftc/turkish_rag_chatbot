/**
 * Orchestrates the streaming chat experience for one conversation.
 *
 * Responsibilities:
 *  - Create a conversation first when no `conversationId` is supplied (the
 *    stream `done` event returns `message_id` but NOT `conversation_id`, so we
 *    can't rely on backend auto-create to learn the id — we create up front).
 *  - Optimistically append the user's message to the local thread.
 *  - Open the SSE stream, accumulate deltas (rAF-batched for smooth rendering),
 *    collect citations keyed by `citation_number`, track phase.
 *  - On `done`: invalidate `['messages', convId]` + `['conversations']` so the
 *    persisted thread reconciles, then clear ephemeral stream state.
 *  - Expose a merged `messages` view = server messages + optimistic user +
 *    the live assistant draft, plus `isStreaming`, `phase`, `stop`, `send`.
 */

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useChatStore } from "@/stores/chat";
import { useMessages, createConversation } from "@/features/rag/api";
import { streamChat } from "@/shared/streaming/sseClient";
import { queryKeys, queryKeyRoots } from "@/shared/lib/queryKeys";
import type { CitationOut, MessageOut, MetadataFilter } from "@/shared/types/api";
import type { StreamDoneMeta } from "@/shared/streaming/types";
import type { StreamPhase } from "@/stores/chat";

/** A user-visible row in the thread. May be persisted, optimistic, or streaming. */
export interface ChatRow {
  /** Stable React key. */
  key: string;
  role: "user" | "assistant";
  content: string;
  /** Persisted message (when reconciled). */
  message?: MessageOut;
  /** True while this assistant row is the active streaming draft. */
  streaming?: boolean;
  /** Live citations (streaming row only), keyed by citation_number. */
  citations?: Record<number, CitationOut>;
  /** Done metadata (streaming row, after done). */
  doneMeta?: StreamDoneMeta | null;
}

export interface SendOptions {
  filters?: MetadataFilter;
}

export interface UseStreamingChat {
  messages: ChatRow[];
  isStreaming: boolean;
  phase: StreamPhase;
  /** Live citations for the active/last assistant turn. */
  liveCitations: Record<number, CitationOut>;
  doneMeta: StreamDoneMeta | null;
  /** Last user query (for follow-up suggestion heuristics). */
  lastQuery: string | null;
  send: (query: string, opts?: SendOptions) => Promise<void>;
  stop: () => void;
}

/** Fallback before clearing the draft if the persisted row never matches. */
const RECONCILE_TIMEOUT_MS = 4000;

export function useStreamingChat(conversationId: string | undefined): UseStreamingChat {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const messagesQuery = useMessages(conversationId);

  // Ephemeral streaming state.
  const store = useChatStore();
  const [lastQuery, setLastQuery] = React.useState<string | null>(null);

  // rAF batching: deltas land in a ref buffer, flushed once per frame.
  const deltaBuffer = React.useRef("");
  const rafId = React.useRef<number | null>(null);

  const flushDeltas = React.useCallback(() => {
    rafId.current = null;
    if (deltaBuffer.current) {
      const chunk = deltaBuffer.current;
      deltaBuffer.current = "";
      useChatStore.getState().appendDraft(chunk);
    }
  }, []);

  const scheduleFlush = React.useCallback(() => {
    if (rafId.current != null) return;
    rafId.current =
      typeof requestAnimationFrame !== "undefined"
        ? requestAnimationFrame(flushDeltas)
        : (setTimeout(flushDeltas, 16) as unknown as number);
  }, [flushDeltas]);

  // Cancel any pending rAF on unmount.
  React.useEffect(
    () => () => {
      if (rafId.current != null && typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(rafId.current);
      }
    },
    [],
  );

  const stop = React.useCallback(() => {
    const { abort } = useChatStore.getState();
    abort?.abort();
    // Flush whatever we buffered so the partial answer is preserved on screen.
    flushDeltas();
    useChatStore.setState({ isStreaming: false, phase: "idle", abort: null });
  }, [flushDeltas]);

  const send = React.useCallback(
    async (rawQuery: string, opts?: SendOptions) => {
      const query = rawQuery.trim();
      if (!query || useChatStore.getState().isStreaming) return;
      setLastQuery(query);

      // 1. Ensure we have a conversation id (create-first when absent).
      let convId = conversationId;
      if (!convId) {
        try {
          const created = await createConversation({});
          convId = created.id;
          qc.invalidateQueries({ queryKey: queryKeyRoots.conversations });
          // Reflect the new conversation in the URL so reload restores it.
          navigate(`/chat/${convId}`, { replace: true });
        } catch {
          toast.error("Sohbet oluşturulamadı. Lütfen tekrar deneyin.");
          return;
        }
      }

      // 2. Optimistic user message + open stream state.
      const abort = new AbortController();
      const clientId = `pending-${Date.now()}`;
      useChatStore.getState().start(convId, { clientId, content: query }, abort);

      // 3. Stream.
      await streamChat(
        { query, conversation_id: convId, filters: opts?.filters, stream: true, debug: false },
        {
          onDelta: (text) => {
            deltaBuffer.current += text;
            scheduleFlush();
          },
          onCitation: (c) => useChatStore.getState().addCitation(c),
          onDone: (meta) => {
            flushDeltas();
            handleDone(meta, convId as string);
          },
          onError: (err) => {
            flushDeltas();
            useChatStore.setState({ isStreaming: false, phase: "idle", abort: null });
            toast.error(err.message);
          },
        },
        abort.signal,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId, qc, navigate, scheduleFlush, flushDeltas],
  );

  // After `done`: mark finished, then invalidate so the persisted thread loads.
  // The ephemeral draft stays visible (handleDone leaves it) until the persisted
  // assistant row actually arrives — reconciled in the effect below — so there's
  // no flash where the answer briefly disappears.
  function handleDone(meta: StreamDoneMeta, convId: string) {
    useChatStore.getState().finish(meta);
    qc.invalidateQueries({ queryKey: queryKeys.messages(convId) });
    qc.invalidateQueries({ queryKey: queryKeyRoots.conversations });
  }

  // ── Build the merged thread view ──────────────────────────────────────────
  const serverMessages = messagesQuery.data ?? [];

  // Reconcile: once the persisted assistant message (matching the done event's
  // message_id) lands in the cache, clear the ephemeral stream state. A safety
  // timeout covers the case where the id never matches (e.g. backend mismatch).
  React.useEffect(() => {
    const s = useChatStore.getState();
    if (s.isStreaming || s.doneMeta == null) return;
    const persisted = serverMessages.some(
      (m) => m.role === "assistant" && m.id === s.doneMeta?.message_id,
    );
    if (persisted) {
      s.reset();
      return;
    }
    const t = window.setTimeout(() => {
      const cur = useChatStore.getState();
      if (!cur.isStreaming && cur.doneMeta != null) cur.reset();
    }, RECONCILE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [serverMessages, store.doneMeta, store.isStreaming]);
  // The ephemeral stream belongs to exactly one conversation (store.conversationId).
  // Show its optimistic rows ONLY on that conversation's page — or on the brand-new
  // /chat page (no id yet) while that conversation is being created. The previous
  // `|| store.conversationId != null` fallback leaked the live message into every
  // open conversation (it appeared in the wrong chat, then vanished on reconcile).
  const streamBelongsHere =
    store.conversationId === conversationId ||
    (conversationId == null && store.isStreaming);
  const streamingActive =
    store.isStreaming || store.draft.length > 0 || store.pendingUser != null;

  const messages = React.useMemo<ChatRow[]>(() => {
    const rows: ChatRow[] = serverMessages.map((m) => ({
      key: m.id,
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
      message: m,
    }));

    const showStream = streamingActive && streamBelongsHere;
    if (!showStream) return rows;

    // Avoid duplicating a user message that the server has already persisted.
    const pending = store.pendingUser;
    if (pending) {
      const alreadyPersisted = serverMessages.some(
        (m) => m.role === "user" && m.content === pending.content,
      );
      if (!alreadyPersisted) {
        rows.push({
          key: pending.clientId,
          role: "user",
          content: pending.content,
        });
      }
    }

    // The live assistant draft (only while it has content or is still streaming).
    if (store.isStreaming || store.draft.length > 0) {
      const draftPersisted =
        store.doneMeta != null &&
        serverMessages.some((m) => m.role === "assistant" && m.id === store.doneMeta?.message_id);
      if (!draftPersisted) {
        rows.push({
          key: "streaming-draft",
          role: "assistant",
          content: store.draft,
          streaming: store.isStreaming,
          citations: store.citations,
          doneMeta: store.doneMeta,
        });
      }
    }

    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    serverMessages,
    streamingActive,
    streamBelongsHere,
    store.pendingUser,
    store.isStreaming,
    store.draft,
    store.citations,
    store.doneMeta,
  ]);

  return {
    messages,
    isStreaming: store.isStreaming,
    phase: store.phase,
    liveCitations: store.citations,
    doneMeta: store.doneMeta,
    lastQuery,
    send,
    stop,
  };
}
