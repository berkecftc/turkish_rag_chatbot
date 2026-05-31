/**
 * Auth API — typed against `TokenPair`.
 *
 * NOTE: These calls intentionally use a bare axios POST (not the shared `api`
 * instance) because login has no bearer token yet, and refresh must bypass the
 * 401-refresh interceptor to avoid recursion. The shared interceptor already
 * owns automatic refresh on protected calls.
 */

import axios from "axios";
import type { TokenPair } from "@/shared/types/api";

const AUTH_BASE = "/api/v1/auth";

export async function login(email: string, password: string): Promise<TokenPair> {
  const { data } = await axios.post<TokenPair>(`${AUTH_BASE}/login`, { email, password });
  return data;
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  const { data } = await axios.post<TokenPair>(`${AUTH_BASE}/refresh`, {
    refresh_token: refreshToken,
  });
  return data;
}
