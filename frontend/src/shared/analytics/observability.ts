/**
 * Frontend observability (Phase 13).
 *
 * A tiny, dependency-free telemetry layer with a PLUGGABLE SINK so a real
 * provider (Sentry, Datadog RUM, …) can drop in later without touching call
 * sites. The default sink logs to the console in DEV and is a no-op in PROD.
 *
 * What it captures:
 *  - Global `window.onerror` + `unhandledrejection` (see {@link installGlobalErrorHandlers}).
 *  - React render errors forwarded from `app/ErrorBoundary.tsx`.
 *  - API latency for every axios request (timer hook wired in `lib/api.ts`).
 *  - Stream interruptions reported by `shared/streaming/sseClient.ts`.
 *  - Arbitrary interaction events via {@link trackEvent}.
 *  - Basic web-vitals (LCP / CLS) via `PerformanceObserver` — NO extra dep,
 *    fully guarded so unsupported browsers degrade silently.
 *
 * Nothing here is presented to the user as product data; it is pure telemetry.
 */

// ── Event taxonomy ───────────────────────────────────────────────────────────
export type ObservabilityEventType =
  | "error"
  | "unhandled_rejection"
  | "react_error"
  | "api_latency"
  | "stream_interrupted"
  | "interaction"
  | "web_vital";

export interface ObservabilityEvent {
  type: ObservabilityEventType;
  /** Short machine name, e.g. "api_latency" or an interaction name. */
  name: string;
  /** Epoch milliseconds when the event was recorded. */
  timestamp: number;
  /** Arbitrary structured context (never PII-sensitive tokens). */
  props?: Record<string, unknown>;
}

/** A sink consumes events. Swap the active sink to integrate a real provider. */
export interface ObservabilitySink {
  capture(event: ObservabilityEvent): void;
}

const isDev =
  typeof import.meta !== "undefined" &&
  Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

/** DEV: pretty console output. PROD: silent. */
const consoleSink: ObservabilitySink = {
  capture(event) {
    if (!isDev) return;
    const tag = `%c[obs:${event.type}]`;
    const style =
      event.type === "error" || event.type === "react_error"
        ? "color:#ef4444;font-weight:600"
        : event.type === "stream_interrupted"
          ? "color:#f59e0b;font-weight:600"
          : "color:#6366f1;font-weight:600";
     
    console.debug(tag, style, event.name, event.props ?? {});
  },
};

/** No-op sink (default in PROD until a real sink is registered). */
const noopSink: ObservabilitySink = { capture() {} };

let activeSink: ObservabilitySink = isDev ? consoleSink : noopSink;

/**
 * Register the active telemetry sink. Call this once at startup to plug in a
 * real provider (e.g. wrap Sentry.captureMessage). Returns the previous sink.
 */
export function setObservabilitySink(sink: ObservabilitySink): ObservabilitySink {
  const prev = activeSink;
  activeSink = sink;
  return prev;
}

/** Low-level emit. Never throws — telemetry must not break the app. */
export function capture(event: Omit<ObservabilityEvent, "timestamp"> & { timestamp?: number }): void {
  try {
    activeSink.capture({ timestamp: Date.now(), ...event });
  } catch {
    /* swallow — telemetry is best-effort */
  }
}

// ── Public helpers ───────────────────────────────────────────────────────────

/** Record a user/system interaction, e.g. `trackEvent("settings.theme_change", { theme })`. */
export function trackEvent(name: string, props?: Record<string, unknown>): void {
  capture({ type: "interaction", name, props });
}

/** Record API latency for a single request (wired from the axios interceptor). */
export function recordApiLatency(input: {
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  ok: boolean;
}): void {
  capture({
    type: "api_latency",
    name: `${input.method} ${input.url}`,
    props: {
      method: input.method,
      url: input.url,
      status: input.status,
      durationMs: Math.round(input.durationMs),
      ok: input.ok,
    },
  });
}

/**
 * Record a chat-stream interruption. Exported for `sseClient.ts` to call on
 * abort / error so we can observe how often generations are cut short.
 */
export function recordStreamInterruption(reason: "abort" | "error", props?: Record<string, unknown>): void {
  capture({ type: "stream_interrupted", name: reason, props });
}

/** Forward a React render error (from the ErrorBoundary). */
export function recordReactError(error: Error, componentStack?: string | null): void {
  capture({
    type: "react_error",
    name: error.name || "Error",
    props: { message: error.message, componentStack: componentStack ?? undefined },
  });
}

// ── Global handlers + web-vitals (installed once) ────────────────────────────
let installed = false;

/**
 * Install global error/rejection listeners and best-effort web-vitals
 * observers. Idempotent. Safe to call from `main.tsx` before render.
 */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e: ErrorEvent) => {
    capture({
      type: "error",
      name: e.message || "window.onerror",
      props: {
        message: e.message,
        source: e.filename,
        line: e.lineno,
        column: e.colno,
        stack: e.error instanceof Error ? e.error.stack : undefined,
      },
    });
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    capture({
      type: "unhandled_rejection",
      name: "unhandledrejection",
      props: {
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      },
    });
  });

  installWebVitals();
}

/**
 * Basic web-vitals via PerformanceObserver — LCP and CLS only, no dependency.
 * Every observer is wrapped in try/catch and an entry-type support guard so
 * older browsers (or jsdom) never throw.
 */
function installWebVitals(): void {
  if (typeof PerformanceObserver === "undefined") return;

  const supported: string[] = (PerformanceObserver as unknown as { supportedEntryTypes?: string[] })
    .supportedEntryTypes ?? [];

  // Largest Contentful Paint — report the last (largest) candidate on hide.
  if (supported.includes("largest-contentful-paint")) {
    try {
      let lcp = 0;
      const lcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          lcp = entry.startTime;
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      const flushLcp = () => {
        if (lcp > 0) capture({ type: "web_vital", name: "LCP", props: { valueMs: Math.round(lcp) } });
        lcp = -1; // guard against double-report
      };
      addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushLcp();
      });
    } catch {
      /* unsupported */
    }
  }

  // Cumulative Layout Shift — accumulate, report on hide.
  if (supported.includes("layout-shift")) {
    try {
      let cls = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (!e.hadRecentInput && typeof e.value === "number") cls += e.value;
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
      addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          capture({ type: "web_vital", name: "CLS", props: { value: Number(cls.toFixed(4)) } });
        }
      });
    } catch {
      /* unsupported */
    }
  }
}
