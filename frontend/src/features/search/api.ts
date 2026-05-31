/**
 * Search API + hook. Server state only.
 *
 * `useSearch` is a manual, enabled-gated query keyed by the request body — it
 * only fires when `enabled` is true (e.g. after the user submits a query).
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/shared/lib/queryKeys";
import type { SearchRequest, SearchResponse } from "@/shared/types/api";

export async function search(body: SearchRequest): Promise<SearchResponse> {
  const { data } = await api.post<SearchResponse>("/rag/search", body);
  return data;
}

export function useSearch(
  body: SearchRequest,
  options: { enabled?: boolean } = {},
): UseQueryResult<SearchResponse> {
  const enabled = (options.enabled ?? true) && body.query.trim().length > 0;
  return useQuery({
    queryKey: queryKeys.search(body),
    queryFn: () => search(body),
    enabled,
  });
}
