/**
 * Analytics adapter (Phase 11).
 *
 * ⚠️ THERE IS NO `/analytics` ENDPOINT ON THE BACKEND. ⚠️
 *
 * This module is the single seam between the analytics UI and its data:
 *  - `derivedAnalytics`: metrics computed from REAL endpoints
 *    (/ingestion/jobs, /rag/conversations/{id}/messages). These are truthful.
 *  - `mockAnalytics`: clearly-labelled SAMPLE time-series for metrics with no
 *    endpoint yet (token usage over time, latency trend, activity). Every mock
 *    series carries `isSample: true`.
 *
 * SWAPPABILITY: when the backend ships `/analytics/*`, replace `mockAnalytics`
 * (and, if desired, fold the derived computations server-side) by implementing
 * the `AnalyticsSource` interface — the UI consumes `useAnalytics()` and the
 * per-metric `{ data, isSample }` envelope, so no chart component changes.
 *
 * Mock generation is DETERMINISTIC (seeded PRNG) so charts never flicker on
 * re-render.
 */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useJobs } from "@/features/ingestion/api";
import { useConversations, listMessages } from "@/features/rag/api";
import { queryKeys } from "@/shared/lib/queryKeys";
import type { JobStatusOut, MessageOut, ConversationOut } from "@/shared/types/api";

// ── Envelope ─────────────────────────────────────────────────────────────────
/** Wraps any metric with provenance so the UI can label it. */
export interface Metric<T> {
  data: T;
  /** true → SAMPLE data (no backend); false → derived from real endpoints. */
  isSample: boolean;
}

export interface TimePoint {
  /** ISO date (day granularity) for the x-axis. */
  date: string;
  value: number;
}

export interface NamedValue {
  name: string;
  value: number;
}

export interface ConfidenceBucket {
  /** Bucket label, e.g. "0–20%". */
  bucket: string;
  count: number;
}

// ── Source interface (the swappable seam) ────────────────────────────────────
export interface AnalyticsResult {
  // REAL (derived)
  ingestionSuccess: Metric<NamedValue[]>;
  confidenceDistribution: Metric<ConfidenceBucket[]>;
  cacheHit: Metric<{ hitRate: number | null; sampled: number; tokenTotal: number }>;
  // SAMPLE (mock)
  tokenUsageOverTime: Metric<TimePoint[]>;
  latencyTrend: Metric<TimePoint[]>;
  activityOverTime: Metric<TimePoint[]>;
}

export interface AnalyticsSource {
  useAnalytics(range: AnalyticsRange): {
    data: AnalyticsResult | undefined;
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
  };
}

export type AnalyticsRange = "7d" | "30d" | "90d";

export const RANGE_DAYS: Record<AnalyticsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

// ── Derived (REAL) computations ──────────────────────────────────────────────
export function deriveIngestionSuccess(jobs: JobStatusOut[]): NamedValue[] {
  let succeeded = 0;
  let failed = 0;
  let inProgress = 0;
  for (const j of jobs) {
    if (j.status === "succeeded") succeeded += 1;
    else if (j.status === "failed" || j.status === "dead") failed += 1;
    else inProgress += 1;
  }
  return [
    { name: "Tamamlandı", value: succeeded },
    { name: "Başarısız", value: failed },
    { name: "Devam ediyor", value: inProgress },
  ];
}

const CONFIDENCE_BUCKETS = [
  { bucket: "0–20%", min: 0, max: 0.2 },
  { bucket: "20–40%", min: 0.2, max: 0.4 },
  { bucket: "40–60%", min: 0.4, max: 0.6 },
  { bucket: "60–80%", min: 0.6, max: 0.8 },
  { bucket: "80–100%", min: 0.8, max: 1.01 },
] as const;

export function deriveConfidenceDistribution(messages: MessageOut[]): ConfidenceBucket[] {
  const counts = CONFIDENCE_BUCKETS.map((b) => ({ bucket: b.bucket, count: 0 }));
  for (const m of messages) {
    const score = m.confidence_score;
    if (score == null || !Number.isFinite(score)) continue;
    const idx = CONFIDENCE_BUCKETS.findIndex((b) => score >= b.min && score < b.max);
    if (idx >= 0) counts[idx].count += 1;
  }
  return counts;
}

/**
 * Token usage is a REAL aggregate from message `token_count`. We expose it as a
 * cache-hit / token-total summary. NOTE: messages don't carry a `cached` flag
 * (only the non-stream ChatResponse does, which we don't persist), so a true
 * cache-hit RATE isn't derivable from the message list alone — we return null
 * for the rate and surface the honest token total instead.
 */
export function deriveTokenSummary(messages: MessageOut[]): {
  hitRate: number | null;
  sampled: number;
  tokenTotal: number;
} {
  let tokenTotal = 0;
  let sampled = 0;
  for (const m of messages) {
    if (m.token_count != null && Number.isFinite(m.token_count)) {
      tokenTotal += m.token_count;
      sampled += 1;
    }
  }
  return { hitRate: null, sampled, tokenTotal };
}

// ── Deterministic mock (SAMPLE) generation ──────────────────────────────────
/** Mulberry32 — tiny deterministic PRNG so mock data never flickers. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDay(daysAgo: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function mockSeries(
  days: number,
  seed: number,
  base: number,
  amplitude: number,
): TimePoint[] {
  const rand = seededRandom(seed);
  const points: TimePoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const wave = Math.sin((days - i) / 3) * 0.5 + 0.5;
    const noise = rand();
    const value = Math.round(base + amplitude * (wave * 0.6 + noise * 0.4));
    points.push({ date: isoDay(i), value: Math.max(0, value) });
  }
  return points;
}

export function mockTokenUsage(days: number): TimePoint[] {
  return mockSeries(days, 1337, 4000, 9000);
}
export function mockLatencyTrend(days: number): TimePoint[] {
  return mockSeries(days, 7331, 420, 380);
}
export function mockActivity(days: number): TimePoint[] {
  return mockSeries(days, 2024, 12, 40);
}

// ── Named adapters (the two implementations the plan calls for) ──────────────
/**
 * REAL metrics derived purely from existing endpoints. Truthful — no mock.
 * Swap nothing here when the backend ships analytics; these stay valid.
 */
export const derivedAnalytics = {
  ingestionSuccess: deriveIngestionSuccess,
  confidenceDistribution: deriveConfidenceDistribution,
  tokenSummary: deriveTokenSummary,
} as const;

/**
 * SAMPLE metrics with no backend endpoint. Deterministic/seeded. Every series
 * is labelled `isSample: true` at the UI seam. Replace this object when
 * `/analytics/*` ships — the `AnalyticsResult` shape is the stable contract.
 */
export const mockAnalytics = {
  tokenUsageOverTime: mockTokenUsage,
  latencyTrend: mockLatencyTrend,
  activityOverTime: mockActivity,
} as const;

// ── The hook: derived (real) + mock (sample), assembled ─────────────────────
const MESSAGE_SAMPLE_CONVERSATIONS = 5;
const MESSAGE_SAMPLE_LIMIT = 100;

/**
 * Single entry point for the analytics UI. Returns `{ real, sample }` folded
 * into one `AnalyticsResult` where every metric is wrapped in a `Metric<T>`
 * carrying `isSample`.
 */
export function useAnalytics(range: AnalyticsRange): {
  data: AnalyticsResult | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const days = RANGE_DAYS[range];

  // REAL source 1: ingestion jobs.
  const jobsQuery = useJobs({ limit: 100 });

  // REAL source 2: conversations → sample a handful for confidence/token stats.
  const conversationsQuery = useConversations({ limit: MESSAGE_SAMPLE_CONVERSATIONS });
  const convs: ConversationOut[] = conversationsQuery.data ?? [];
  const sampledConvIds = convs.slice(0, MESSAGE_SAMPLE_CONVERSATIONS).map((c) => c.id);

  const messageQueries = useQueries({
    queries: sampledConvIds.map((id) => ({
      queryKey: queryKeys.messages(id),
      queryFn: () => listMessages(id, { limit: MESSAGE_SAMPLE_LIMIT }),
      enabled: Boolean(id),
    })),
  });

  const allMessages: MessageOut[] = useMemo(
    () => messageQueries.flatMap((q) => q.data ?? []),
    [messageQueries],
  );

  const isLoading =
    jobsQuery.isLoading ||
    conversationsQuery.isLoading ||
    messageQueries.some((q) => q.isLoading);
  const isError =
    jobsQuery.isError || conversationsQuery.isError || messageQueries.some((q) => q.isError);

  const data: AnalyticsResult | undefined = useMemo(() => {
    if (isLoading) return undefined;
    const jobs = jobsQuery.data ?? [];
    return {
      // REAL (derivedAnalytics)
      ingestionSuccess: { data: derivedAnalytics.ingestionSuccess(jobs), isSample: false },
      confidenceDistribution: {
        data: derivedAnalytics.confidenceDistribution(allMessages),
        isSample: false,
      },
      cacheHit: { data: derivedAnalytics.tokenSummary(allMessages), isSample: false },
      // SAMPLE (mockAnalytics)
      tokenUsageOverTime: { data: mockAnalytics.tokenUsageOverTime(days), isSample: true },
      latencyTrend: { data: mockAnalytics.latencyTrend(days), isSample: true },
      activityOverTime: { data: mockAnalytics.activityOverTime(days), isSample: true },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, jobsQuery.data, allMessages, days]);

  const refetch = () => {
    void jobsQuery.refetch();
    void conversationsQuery.refetch();
    messageQueries.forEach((q) => void q.refetch());
  };

  return { data, isLoading, isError, refetch };
}
