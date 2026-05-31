import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuth } from "@/stores/auth";

export const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

// Attach access token.
api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single-flight refresh on 401, then retry the original request once.
let refreshing: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const { refreshToken, setTokens, clear } = useAuth.getState();
  if (!refreshToken) throw new Error("No refresh token");
  try {
    const { data } = await axios.post("/api/v1/auth/refresh", { refresh_token: refreshToken });
    setTokens(data.access_token, data.refresh_token);
    return data.access_token as string;
  } catch (e) {
    clear();
    throw e;
  }
}

/**
 * Single-flight access-token refresh. Concurrent callers (the axios interceptor
 * AND the streaming SSE client) share the same in-flight promise so the refresh
 * endpoint is only hit once. Exported so `shared/streaming/sseClient.ts` can
 * reuse the exact same logic instead of replicating it.
 */
export function refreshAccessToken(): Promise<string> {
  refreshing ??= doRefresh().finally(() => (refreshing = null));
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const token = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    }
    return Promise.reject(error);
  },
);
