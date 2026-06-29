/**
 * RAG REST API + TanStack hooks. Server state only.
 *
 * Streaming (`POST /rag/chat/stream`) is intentionally NOT implemented here —
 * Phase 5 owns the dedicated SSE client. This module covers the non-stream chat
 * call plus the conversation / message / debug REST surface.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys, queryKeyRoots, type ListParams } from "@/shared/lib/queryKeys";
import type {
  ChatRequest,
  ChatResponse,
  ConversationCreate,
  ConversationOut,
  DebugResponse,
  MessageOut,
} from "@/shared/types/api";

// ── Raw calls ───────────────────────────────────────────────────────────────
/** Non-streaming chat. Forces `stream: false`. */
export async function chatOnce(body: ChatRequest): Promise<ChatResponse> {
  const { data } = await api.post<ChatResponse>("/rag/chat", { ...body, stream: false });
  return data;
}

export async function createConversation(body: ConversationCreate = {}): Promise<ConversationOut> {
  const { data } = await api.post<ConversationOut>("/rag/conversations", body);
  return data;
}

export async function listConversations(params: ListParams = {}): Promise<ConversationOut[]> {
  const { data } = await api.get<ConversationOut[]>("/rag/conversations", { params });
  return data;
}

export async function listMessages(
  conversationId: string,
  params: ListParams = {},
): Promise<MessageOut[]> {
  const { data } = await api.get<MessageOut[]>(
    `/rag/conversations/${conversationId}/messages`,
    { params },
  );
  return data;
}

export async function getDebug(messageId: string): Promise<DebugResponse> {
  const { data } = await api.get<DebugResponse>(`/rag/debug/${messageId}`);
  return data;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await api.delete(`/rag/conversations/${conversationId}`);
}

// ── Hooks ───────────────────────────────────────────────────────────────────
export function useConversations(params: ListParams = {}): UseQueryResult<ConversationOut[]> {
  return useQuery({
    queryKey: queryKeys.conversations(),
    queryFn: () => listConversations(params),
  });
}

/**
 * Paginated conversations list — keyed by `{limit, offset}` so each page is
 * cached independently (used by the full Conversation History view). Distinct
 * from `useConversations` (which keys only on the root for rail/recent use).
 */
export function useConversationsPage(
  params: ListParams = {},
): UseQueryResult<ConversationOut[]> {
  return useQuery({
    queryKey: [...queryKeys.conversations(), "page", params] as const,
    queryFn: () => listConversations(params),
    placeholderData: (prev) => prev,
  });
}

export function useMessages(
  conversationId: string | undefined,
): UseQueryResult<MessageOut[]> {
  return useQuery({
    queryKey: queryKeys.messages(conversationId ?? ""),
    queryFn: () => listMessages(conversationId as string),
    enabled: Boolean(conversationId),
  });
}

export function useDebug(messageId: string | undefined): UseQueryResult<DebugResponse> {
  return useQuery({
    queryKey: queryKeys.debug(messageId ?? ""),
    queryFn: () => getDebug(messageId as string),
    enabled: Boolean(messageId),
  });
}

export function useCreateConversation(): UseMutationResult<
  ConversationOut,
  unknown,
  ConversationCreate | void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ConversationCreate | void) => createConversation(body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeyRoots.conversations });
    },
  });
}

export function useDeleteConversation(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeyRoots.conversations });
    },
  });
}
