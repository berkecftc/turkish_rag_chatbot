import { Scale } from "lucide-react";
import { formatPercent } from "@/shared/lib/format";
import { Panel } from "./Panel";

export interface HybridWeightsProps {
  vectorWeight?: number | null;
  bm25Weight?: number | null;
}

/**
 * Split bar showing the vector vs BM25 contribution to the hybrid retrieval
 * score. Weights are normalized to sum to 1 for the visual; raw values shown
 * as percentages. Renders nothing meaningful (a hint) when both are absent.
 */
export function HybridWeights({ vectorWeight, bm25Weight }: HybridWeightsProps) {
  const v = vectorWeight ?? null;
  const b = bm25Weight ?? null;
  const sum = (v ?? 0) + (b ?? 0);

  const hasAny = v != null || b != null;
  // Normalize for the bar geometry; guard divide-by-zero.
  const vPct = sum > 0 ? ((v ?? 0) / sum) * 100 : 50;
  const bPct = sum > 0 ? ((b ?? 0) / sum) * 100 : 50;

  return (
    <Panel title="Hibrit ağırlıklar" icon={<Scale aria-hidden="true" />}>
      {!hasAny ? (
        <p className="text-sm text-muted-foreground">Ağırlık bilgisi mevcut değil.</p>
      ) : (
        <div className="space-y-2">
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`Vektör ${formatPercent(v)}, BM25 ${formatPercent(b)}`}
          >
            <div className="h-full bg-chart-1" style={{ width: `${vPct}%` }} />
            <div className="h-full bg-chart-5" style={{ width: `${bPct}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 rounded-full bg-chart-1" aria-hidden="true" />
              Vektör · <span className="tabular-nums text-foreground">{formatPercent(v)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              BM25 · <span className="tabular-nums text-foreground">{formatPercent(b)}</span>
              <span className="size-2.5 rounded-full bg-chart-5" aria-hidden="true" />
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}
