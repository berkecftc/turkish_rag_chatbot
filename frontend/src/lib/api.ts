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

async function refreshAccessToken(): Promise<string> {
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

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      refreshing ??= refreshAccessToken().finally(() => (refreshing = null));
      const token = await refreshing;
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    }
    return Promise.reject(error);
  },
);
