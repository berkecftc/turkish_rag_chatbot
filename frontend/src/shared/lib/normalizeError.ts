/**
 * Single error-normalization surface. Every UI consumes the shape returned here
 * rather than poking at raw axios/Error objects.
 *
 * The backend emits RFC 9457 problem+json (see backend/app/core/exceptions.py):
 *   { type, title, status, detail, request_id }
 * where `title` is the machine code (e.g. "not_found") and `detail` is a human
 * message. We prefer `detail`, fall back to a Turkish status-based message.
 */

import { AxiosError } from "axios";

export interface NormalizedError {
  /** Machine code, e.g. "not_found", "network", "rate_limited", "unknown". */
  code: string;
  /** Turkish, user-facing message. */
  message: string;
  /** HTTP status when available. */
  status?: number;
  /** True when retrying may succeed (network / 429 / 5xx). */
  retriable: boolean;
}

/** Backend problem+json envelope (subset we read). */
interface ProblemJson {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  request_id?: string;
}

/** Turkish messages keyed by HTTP status. */
const STATUS_MESSAGES: Record<number, string> = {
  400: "İstek geçersiz.",
  401: "Oturumunuz sona erdi. Lütfen yeniden giriş yapın.",
  403: "Bu işlem için yetkiniz yok.",
  404: "Kayıt bulunamadı.",
  409: "Çakışma: kayıt zaten mevcut.",
  422: "Gönderilen veriler doğrulanamadı.",
  429: "Çok fazla istek gönderildi. Lütfen biraz bekleyin.",
  500: "Sunucuda beklenmeyen bir hata oluştu.",
  502: "Sunucuya ulaşılamadı.",
  503: "Servis şu anda kullanılamıyor.",
  504: "Sunucu zaman aşımına uğradı.",
};

const NETWORK_MESSAGE = "Ağ bağlantısı kurulamadı. İnternet bağlantınızı kontrol edin.";
const UNKNOWN_MESSAGE = "Beklenmeyen bir hata oluştu.";

function isRetriable(status?: number): boolean {
  if (status === undefined) return true; // network-level failure
  return status === 429 || status >= 500;
}

function isProblemJson(data: unknown): data is ProblemJson {
  return typeof data === "object" && data !== null;
}

export function normalizeError(e: unknown): NormalizedError {
  // ── Axios errors ──────────────────────────────────────────────────────────
  if (e instanceof AxiosError) {
    const status = e.response?.status;

    // No response → network / CORS / aborted.
    if (!e.response) {
      const aborted = e.code === "ERR_CANCELED";
      return {
        code: aborted ? "canceled" : "network",
        message: aborted ? "İstek iptal edildi." : NETWORK_MESSAGE,
        retriable: !aborted,
      };
    }

    const body = e.response.data;
    const problem = isProblemJson(body) ? (body as ProblemJson) : undefined;
    const code = problem?.title ?? `http_${status}`;
    const message =
      problem?.detail ??
      (status !== undefined ? STATUS_MESSAGES[status] : undefined) ??
      UNKNOWN_MESSAGE;

    return { code, message, status, retriable: isRetriable(status) };
  }

  // ── Generic Error ─────────────────────────────────────────────────────────
  if (e instanceof Error) {
    return { code: "error", message: e.message || UNKNOWN_MESSAGE, retriable: false };
  }

  // ── Unknown ───────────────────────────────────────────────────────────────
  return { code: "unknown", message: UNKNOWN_MESSAGE, retriable: false };
}
