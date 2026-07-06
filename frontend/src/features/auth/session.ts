/**
 * Client-side session lifecycle. There is NO server logout — logout clears
 * persisted tokens + wipes the React Query cache + redirects. Identity comes
 * from `GET /auth/me` (see useMe); the decoded token claims remain available
 * for permission checks (useCurrentUser / usePermissions).
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/shared/lib/queryKeys";
import { useAuth } from "@/stores/auth";
import { decodeAccessToken } from "@/shared/lib/jwt";
import type { MeOut } from "@/shared/types/api";

/**
 * Returns a stable `logout` callback: clears auth tokens, drops all cached
 * server state, and redirects to `/login`. No network call (no server logout).
 */
export function useLogout(): () => void {
  const navigate = useNavigate();
  const clear = useAuth((s) => s.clear);

  return useCallback(() => {
    clear();
    queryClient.clear();
    navigate("/login", { replace: true });
  }, [clear, navigate]);
}

export interface CurrentUser {
  /** user_id (JWT `sub`). */
  userId: string;
  /** tenant_id (JWT `tid`). */
  tenantId: string;
  /** permission strings (JWT `perms[]`). */
  perms: string[];
}

/**
 * Derives the current user identity from the decoded access token. Returns
 * `null` when there is no (or a malformed) token. No `/me` request is made —
 * that endpoint does not exist server-side.
 */
export function useCurrentUser(): CurrentUser | null {
  const accessToken = useAuth((s) => s.accessToken);
  const claims = decodeAccessToken(accessToken);
  if (!claims) return null;
  return {
    userId: claims.sub,
    tenantId: claims.tid,
    perms: claims.perms,
  };
}

async function getMe(): Promise<MeOut> {
  const { data } = await api.get<MeOut>("/auth/me");
  return data;
}

/**
 * Current user identity from `GET /auth/me` (email, role, tenant). Cached per
 * session; keyed on the access token so switching accounts refetches.
 */
export function useMe(): UseQueryResult<MeOut> {
  const accessToken = useAuth((s) => s.accessToken);
  return useQuery({
    queryKey: [...queryKeys.me(), accessToken],
    queryFn: getMe,
    enabled: Boolean(accessToken),
    staleTime: Infinity,
  });
}
