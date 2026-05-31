/**
 * Admin data layer (Phase 12).
 *
 * REAL endpoints only:
 *   - GET /health/ready  → readiness with per-dependency checks.
 *   - GET /metrics       → Prometheus TEXT exposition format (NOT JSON).
 *
 * There are NO `/admin/*`, `/users`, `/roles`, or `/audit` endpoints — those
 * surfaces are clearly-labelled SAMPLE shells in the UI, never fetched here.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";

const HEALTH_POLL_INTERVAL_MS = 15_000;

// ── Health ───────────────────────────────────────────────────────────────────
/** A single dependency check value as reported by /health/ready. */
export type HealthCheckState = "up" | "down" | string;

/**
 * Shape of GET /health/ready. The backend returns `{status, checks:{...}}` but
 * the exact check keys can vary, so `checks` is an open record and we read
 * known keys (postgres, redis) defensively.
 */
export interface HealthReadyResponse {
  status: string;
  checks: Record<string, HealthCheckState>;
}

export async function getHealthReady(): Promise<HealthReadyResponse> {
  const { data } = await api.get<HealthReadyResponse>("/health/ready");
  return data;
}

export function useHealth(): UseQueryResult<HealthReadyResponse> {
  return useQuery({
    queryKey: ["health", "ready"],
    queryFn: getHealthReady,
    // Poll readiness so the admin sees live service state.
    refetchInterval: HEALTH_POLL_INTERVAL_MS,
    // Treat a failed readiness probe as data we still want to render, but let
    // React Query surface the error for the error state.
    retry: 1,
  });
}

// ── Metrics (Prometheus text) ────────────────────────────────────────────────
/** One parsed Prometheus sample line. */
export interface PrometheusSample {
  name: string;
  /** Raw label block without braces, e.g. `method="GET",code="200"`. */
  labels?: string;
  value: number;
}

export interface ParsedMetrics {
  /** Selected samples grouped by metric family name. */
  samples: PrometheusSample[];
  /** The raw text for a collapsible "show raw" view. */
  raw: string;
  /** Total number of sample lines (for a quick summary). */
  totalSamples: number;
}

/**
 * Minimal, defensive Prometheus text parser. Ignores `# HELP` / `# TYPE`
 * comments and tolerates malformed lines. Only used to surface a few key
 * series; the raw text is always retained for the collapsible view.
 */
export function parsePrometheus(text: string): ParsedMetrics {
  const samples: PrometheusSample[] = [];
  const lines = text.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    // metric_name{labels} value   OR   metric_name value
    const braceIdx = line.indexOf("{");
    let name: string;
    let labels: string | undefined;
    let rest: string;
    if (braceIdx !== -1) {
      const closeIdx = line.indexOf("}", braceIdx);
      if (closeIdx === -1) continue;
      name = line.slice(0, braceIdx).trim();
      labels = line.slice(braceIdx + 1, closeIdx);
      rest = line.slice(closeIdx + 1).trim();
    } else {
      const sp = line.indexOf(" ");
      if (sp === -1) continue;
      name = line.slice(0, sp).trim();
      rest = line.slice(sp + 1).trim();
    }
    const valueToken = rest.split(/\s+/)[0];
    const value = Number(valueToken);
    if (!name || !Number.isFinite(value)) continue;
    samples.push({ name, labels, value });
  }
  return { samples, raw: text, totalSamples: samples.length };
}

export async function getMetrics(): Promise<ParsedMetrics> {
  // Prometheus exposition is text/plain — force a text response so axios does
  // not try to JSON-parse it.
  const { data } = await api.get<string>("/metrics", { responseType: "text" });
  return parsePrometheus(typeof data === "string" ? data : String(data));
}

export function useMetrics(): UseQueryResult<ParsedMetrics> {
  return useQuery({
    queryKey: ["metrics"],
    queryFn: getMetrics,
    refetchInterval: HEALTH_POLL_INTERVAL_MS,
    retry: 1,
  });
}

/**
 * Pick a handful of "interesting" metric families to highlight (http + process)
 * without overwhelming the UI. Returns up to `limit` families with their
 * aggregate sample count and a representative value.
 */
export interface MetricHighlight {
  name: string;
  /** Number of series in this family. */
  series: number;
  /** Sum of values across the family (useful for counters). */
  total: number;
}

const HIGHLIGHT_PREFIXES = ["http_request", "http_requests", "process_", "python_"];

export function highlightMetrics(parsed: ParsedMetrics | undefined, limit = 6): MetricHighlight[] {
  if (!parsed) return [];
  const families = new Map<string, MetricHighlight>();
  for (const s of parsed.samples) {
    if (!HIGHLIGHT_PREFIXES.some((p) => s.name.startsWith(p))) continue;
    const existing = families.get(s.name) ?? { name: s.name, series: 0, total: 0 };
    existing.series += 1;
    existing.total += s.value;
    families.set(s.name, existing);
  }
  return Array.from(families.values())
    .sort((a, b) => b.series - a.series)
    .slice(0, limit);
}
