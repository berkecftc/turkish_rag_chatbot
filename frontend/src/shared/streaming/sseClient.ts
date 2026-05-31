/**
 * SSE streaming client for `POST /api/v1/rag/chat/stream`.
 *
 * Why not `EventSource`? `EventSource` is GET-only and cannot set an
 * `Authorization` header. The stream endpoint is a POST that requires a bearer
 * token, so we MUST use `fetch` + `response.body.getReader()` and parse the
 * `text/event-stream` wire format by hand.
 *
 * Wire format (per the Phase 0 contract):
 *   - Each event is a line `data: <json>\n\n`.
 *   - `<json>` is discriminated by `type`: "delta" | "citation" | "done".
 *   - The stream terminates with a literal `data: [DONE]`.
 *
 * Resilience:
 *   - Partial chunks are buffered across reads and only parsed on `\n\n`.
 *   - A 401 triggers a single-flight refresh (shared with the axios layer) and
 *     ONE retry of the whole request.
 *   - Aborting via the provided `AbortSignal` resolves quietly (no onError).
 */

import { useAuth } from "@/stores/auth";
import { refreshAccessToken } from "@/lib/api";
import { normalizeError } from "@/shared/lib/normalizeError";
import type { ChatRequest, StreamEvent } from "@/shared/types/api";
import type { StreamHandlers } from "./types";

const STREAM_URL = "/api/v1/rag/chat/stream";
const DONE_SENTINEL = "[DONE]";

/** Was this error caused by the caller aborting the request? */
function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Parse a single `data:`-stripped payload, dispatch by `type`. Returns `true`
 * when the terminal `done` event was seen so the reader loop can stop.
 */
function dispatchEvent(payload: string, handlers: StreamHandlers): boolean {
  if (payload === DONE_SENTINEL) return true;

  let event: StreamEvent;
  try {
    event = JSON.parse(payload) as StreamEvent;
  } catch {
    // Tolerate malformed/non-JSON keep-alive lines rather than aborting.
    return false;
  }

  switch (event.type) {
    case "delta":
      if (event.content) handlers.onDelta(event.content);
      return false;
    case "citation":
      handlers.onCitation(event.citation);
      return false;
    case "done": {
      const { type: _type, ...meta } = event;
      void _type;
      handlers.onDone(meta);
      return true;
    }
    default:
      return false;
  }
}

/**
 * Drain one SSE field block (lines between blank-line delimiters). A block may
 * contain multiple `data:` lines per the SSE spec; we concatenate their values.
 * Returns whether the terminal event was dispatched.
 */
function processBlock(block: string, handlers: StreamHandlers): boolean {
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith("data:")) {
      // Strip the "data:" prefix and an optional single leading space.
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    // Other fields (event:, id:, comments starting with ":") are ignored.
  }
  if (dataLines.length === 0) return false;
  return dispatchEvent(dataLines.join("\n"), handlers);
}

/** Issue the fetch with the current access token. */
function openStream(body: ChatRequest, signal: AbortSignal): Promise<Response> {
  const token = useAuth.getState().accessToken;
  return fetch(STREAM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
}

/**
 * Stream a chat completion. Resolves when the stream completes (or is aborted);
 * never rejects — failures are reported through `handlers.onError`.
 */
export async function streamChat(
  body: ChatRequest,
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  try {
    let res = await openStream(body, signal);

    // 401 → single-flight refresh → retry ONCE.
    if (res.status === 401) {
      try {
        await refreshAccessToken();
      } catch {
        handlers.onError(normalizeError({ response: { status: 401 } }));
        return;
      }
      res = await openStream(body, signal);
    }

    if (!res.ok || !res.body) {
      // Build a synthetic axios-like shape so normalizeError reuses status maps.
      let detail: unknown;
      try {
        detail = await res.json();
      } catch {
        detail = undefined;
      }
      handlers.onError(normalizeError({ response: { status: res.status, data: detail } }));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Read loop. Buffer until we have a complete `\n\n`-delimited block.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let sepIndex: number;
      // Handle both LF and CRLF blank-line separators.
      while ((sepIndex = indexOfBlankLine(buffer)) !== -1) {
        const block = buffer.slice(0, sepIndex);
        buffer = buffer.slice(blankLineEnd(buffer, sepIndex));
        if (processBlock(block, handlers)) {
          // Terminal event seen; stop reading.
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          return;
        }
      }
    }

    // Flush any trailing buffered block (stream ended without a final blank line).
    const tail = buffer.trim();
    if (tail) processBlock(tail, handlers);
  } catch (err) {
    if (isAbortError(err) || signal.aborted) return; // quiet on abort
    handlers.onError(normalizeError(err));
  }
}

/** Index of the start of a blank-line separator (`\n\n` or `\r\n\r\n`), or -1. */
function indexOfBlankLine(s: string): number {
  const lf = s.indexOf("\n\n");
  const crlf = s.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

/** End offset (exclusive) of the blank-line separator starting at `start`. */
function blankLineEnd(s: string, start: number): number {
  return s.startsWith("\r\n\r\n", start) ? start + 4 : start + 2;
}
