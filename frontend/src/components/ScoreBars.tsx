import { cn } from "@/lib/utils";
import { formatPercent } from "@/shared/lib/format";

/** Bar fill color keys → static Tailwind classes (so JIT keeps them). */
const BAR_COLORS = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
  "chart-6": "bg-chart-6",
} as const;

export type BarColor = keyof typeof BAR_COLORS;

export interface ScoreRow {
  label: string;
  /** 0..1 score, or undefined when not provided by the backend. */
  value?: number;
  color: BarColor;
}

/**
 * Compact list of labelled mini score bars. Scores are clamped to 0..1 and
 * rendered as a filled track. Missing scores render a muted "—".
 */
export function ScoreBars({ rows, className }: { rows: ScoreRow[]; className?: string }) {
  return (
    <dl className={cn("space-y-1.5", className)}>
      {rows.map((r) => {
        const pct = r.value == null ? null : Math.max(0, Math.min(1, r.value));
        return (
          <div key={r.label} className="flex items-center gap-2">
            <dt className="w-28 shrink-0 text-[11px] text-muted-foreground">{r.label}</dt>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              {pct != null && (
                <div
                  className={cn("h-full rounded-full", BAR_COLORS[r.color])}
                  style={{ width: `${pct * 100}%` }}
                />
              )}
            </div>
            <dd className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {pct == null ? "—" : formatPercent(pct)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Build the standard citation score rows from a CitationOut-like object. */
export function citationScoreRows(c: {
  vector_score?: number;
  rerank_score?: number;
  combined_score?: number;
  source_reliability?: number;
}): ScoreRow[] {
  return [
    { label: "Vektör", value: c.vector_score, color: "chart-1" },
    { label: "Yeniden sıralama", value: c.rerank_score, color: "chart-2" },
    { label: "Birleşik", value: c.combined_score, color: "chart-3" },
    { label: "Kaynak güveni", value: c.source_reliability, color: "chart-4" },
  ];
}

/**
 * Build score rows for a search/retrieval result that also carries a BM25
 * score. Mirrors the column order used across the search + debug surfaces.
 */
export function retrievalScoreRows(c: {
  vector_score?: number;
  bm25_score?: number;
  combined_score?: number;
  rerank_score?: number;
  source_reliability?: number;
}): ScoreRow[] {
  return [
    { label: "Vektör", value: c.vector_score, color: "chart-1" },
    { label: "BM25", value: c.bm25_score, color: "chart-5" },
    { label: "Birleşik", value: c.combined_score, color: "chart-3" },
    { label: "Yeniden sıralama", value: c.rerank_score, color: "chart-2" },
    { label: "Kaynak güveni", value: c.source_reliability, color: "chart-4" },
  ];
}
