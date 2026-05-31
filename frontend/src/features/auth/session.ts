/**
 * Client-side session lifecycle. There is NO server logout and NO `/me`
 * endpoint — both are derived entirely on the client:
 *   - logout = clear persisted tokens + wipe the React Query cache + redirect.
 *   - current user = decoded (DISPLAY-ONLY) access-token claims.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/stores/auth";
import { decodeAccessToken } from "@/shared/lib/jwt";

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
