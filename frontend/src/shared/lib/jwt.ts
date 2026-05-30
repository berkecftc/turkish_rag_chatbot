import { useAuth } from "@/stores/auth";

/**
 * Decoded JWT access-token claims we surface in the UI.
 *
 * NOTE: This decode is DISPLAY-ONLY. We do NOT verify the signature — the
 * backend is the source of truth for authorization. RBAC in this app is
 * permission-based (`perms[]`), never role-based.
 */
export interface AccessTokenClaims {
  /** user_id */
  sub: string;
  /** tenant_id */
  tid: string;
  /** permission strings, e.g. ["admin:read", "documents:write"] */
  perms: string[];
}

/** Base64url → UTF-8 string. Returns null on malformed input. */
function base64UrlDecode(input: string): string | null {
  try {
    let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad === 2) b64 += "==";
    else if (pad === 3) b64 += "=";
    else if (pad === 1) return null; // invalid length
    const binary = atob(b64);
    // Decode UTF-8 (handles Turkish / non-ASCII claim values).
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Decode the payload of a JWT access token (no verification). Returns the
 * subset of claims the UI needs, or `null` for any malformed / missing token.
 */
export function decodeAccessToken(token: string | null): AccessTokenClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const json = base64UrlDecode(parts[1]);
  if (!json) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;

  const p = payload as Record<string, unknown>;
  const sub = typeof p.sub === "string" ? p.sub : "";
  const tid = typeof p.tid === "string" ? p.tid : "";
  const perms = Array.isArray(p.perms)
    ? p.perms.filter((x): x is string => typeof x === "string")
    : [];

  return { sub, tid, perms };
}

export interface UsePermissionsResult {
  perms: string[];
  has: (perm: string) => boolean;
}

/**
 * Reads the current access token from the auth store, decodes its `perms[]`,
 * and returns a `has(perm)` predicate for permission-gated UI.
 */
export function usePermissions(): UsePermissionsResult {
  const accessToken = useAuth((s) => s.accessToken);
  const claims = decodeAccessToken(accessToken);
  const perms = claims?.perms ?? [];
  return {
    perms,
    has: (perm: string) => perms.includes(perm),
  };
}
