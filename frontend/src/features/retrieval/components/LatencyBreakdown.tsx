import { Timer } from "lucide-react";
import { formatLatency } from "@/shared/lib/format";
import { Panel } from "./Panel";

export interface LatencyBreakdownProps {
  retrievalMs?: number | null;
  rerankMs?: number | null;
  generationMs?: number | null;
  totalMs?: number | null;
}

interface Segment {
  label: string;
  value: number;
  color: string;
}

/**
 * Horizontal segmented bar of the latency phases (retrieval / rerank /
 * generation) plus a legend. Null phases are skipped. The bar is scaled to
 * `totalMs` when present, otherwise to the sum of known phases — so a missing
 * total still produces a sensible visual.
 */
export function LatencyBreakdown({
  retrievalMs,
  rerankMs,
  generationMs,
  totalMs,
}: LatencyBreakdownProps) {
  const segments: Segment[] = [
    { label: "Getirim", value: retrievalMs ?? 0, color: "bg-chart-1" },
    { label: "Yeniden sıralama", value: rerankMs ?? 0, color: "bg-chart-2" },
    { label: "Üretim", value: generationMs ?? 0, color: "bg-chart-3" },
  ].filter((s) => s.value > 0);

  const knownSum = segments.reduce((acc, s) => acc + s.value, 0);
  // Prefer the reported total; clamp denominator to the known sum so segments
  // never overflow the track.
  const scale = Math.max(totalMs ?? 0, knownSum);
  const hasAny = segments.length > 0 || (totalMs ?? 0) > 0;

  const rawValues: { label: string; ms?: number | null }[] = [
    { label: "Getirim", ms: retrievalMs },
    { label: "Yeniden sıralama", ms: rerankMs },
    { label: "Üretim", ms: generationMs },
  ];

  return (
    <Panel
      title="Gecikme dökümü"
      icon={<Timer aria-hidden="true" />}
      aside={
        totalMs != null ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            Toplam {formatLatency(totalMs)}
          </span>
        ) : undefined
      }
    >
      {!hasAny ? (
        <p className="text-sm text-muted-foreground">Gecikme bilgisi mevcut değil.</p>
      ) : (
        <div className="space-y-3">
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label="Aşamalara göre gecikme dağılımı"
          >
            {segments.map((s) => (
              <div
                key={s.label}
                className={s.color}
                style={{ width: scale > 0 ? `${(s.value / scale) * 100}%` : "0%" }}
                title={`${s.label}: ${formatLatency(s.value)}`}
              />
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
            {rawValues.map((r, i) => (
              <div key={r.label} className="flex items-center gap-1.5">
                <span
                  className={`size-2.5 rounded-full ${["bg-chart-1", "bg-chart-2", "bg-chart-3"][i]}`}
                  aria-hidden="true"
                />
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="ml-auto tabular-nums text-foreground">{formatLatency(r.ms)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Panel>
  );
}
