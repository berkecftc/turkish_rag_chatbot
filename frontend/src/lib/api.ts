import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuth } from "@/stores/auth";
import { recordApiLatency } from "@/shared/analytics/observability";

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

/**
 * Observability: stamp each request with a start time so the response/error
 * interceptors can compute latency. This is a SEPARATE, additive interceptor —
 * it never touches the auth header above nor the single-flight refresh below.
 */
type TimedConfig = InternalAxiosRequestConfig & { _obsStart?: number };

api.interceptors.request.use((config) => {
  (config as TimedConfig)._obsStart = Date.now();
  return config;
});

function reportLatency(config: TimedConfig | undefined, status: number | undefined, ok: boolean) {
  const start = config?._obsStart;
  if (start == null) return;
  recordApiLatency({
    method: (config?.method ?? "get").toUpperCase(),
    url: config?.url ?? "",
    status,
    durationMs: Date.now() - start,
    ok,
  });
}

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

// AUTH/REFRESH interceptor — unchanged behaviour: single-flight refresh on 401,
// then retry the original request once.
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

/**
 * Observability latency interceptor — registered AFTER the auth interceptor so
 * it runs as the OUTERMOST handler (axios invokes response interceptors in
 * reverse registration order). On a 401 the auth interceptor above re-issues
 * `api(original)`, which starts a fresh interceptor cycle; this outer handler
 * only ever sees the FINAL settled response (success or the retried result),
 * so it records latency without interfering with the refresh/retry flow.
 */
api.interceptors.response.use(
  (res) => {
    reportLatency(res.config as TimedConfig, res.status, true);
    return res;
  },
  (error: AxiosError) => {
    reportLatency(error.config as TimedConfig | undefined, error.response?.status, false);
    return Promise.reject(error);
  },
);
