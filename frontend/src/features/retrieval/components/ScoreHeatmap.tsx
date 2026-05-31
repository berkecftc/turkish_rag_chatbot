import { Grid3x3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/shared/lib/format";
import type { ChunkDebugInfo } from "@/shared/types/api";
import { Panel } from "./Panel";

type ScoreKey = "vector_score" | "bm25_score" | "combined_score" | "rerank_score";

const COLUMNS: { key: ScoreKey; label: string }[] = [
  { key: "vector_score", label: "Vektör" },
  { key: "bm25_score", label: "BM25" },
  { key: "combined_score", label: "Birleşik" },
  { key: "rerank_score", label: "Yeniden sıralama" },
];

/**
 * Intensity buckets → Tailwind opacity classes over a single chart hue. We use
 * fixed classes (not dynamic strings) so the JIT keeps them.
 */
const INTENSITY = [
  "bg-chart-3/10",
  "bg-chart-3/25",
  "bg-chart-3/40",
  "bg-chart-3/60",
  "bg-chart-3/80",
] as const;

/**
 * Min-max normalize a column of (possibly null) values into 0..1. Returns a
 * lookup by index; null entries map to null. When all present values are equal
 * (or there is a single value), everything maps to the top bucket so a uniform
 * column still reads as "high" rather than blank.
 */
function normalizeColumn(values: (number | null | undefined)[]): (number | null)[] {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (present.length === 0) return values.map(() => null);
  const min = Math.min(...present);
  const max = Math.max(...present);
  const range = max - min;
  return values.map((v) => {
    if (v == null || !Number.isFinite(v)) return null;
    if (range === 0) return 1;
    return (v - min) / range;
  });
}

function intensityClass(norm: number | null): string {
  if (norm == null) return "bg-muted/30";
  const idx = Math.min(INTENSITY.length - 1, Math.floor(norm * INTENSITY.length));
  return INTENSITY[Math.max(0, idx)];
}

export interface ScoreHeatmapProps {
  chunks: ChunkDebugInfo[];
}

/**
 * Compact chunk × score-type heatmap. Each column (score type) is normalized
 * independently via min-max so columns on different scales stay comparable;
 * cell color intensity reflects the normalized value, while the printed number
 * is the raw score. Null scores render a dashed muted cell.
 */
export function ScoreHeatmap({ chunks }: ScoreHeatmapProps) {
  if (chunks.length === 0) return null;

  // Precompute normalized intensities per column.
  const normalized: Record<ScoreKey, (number | null)[]> = {
    vector_score: normalizeColumn(chunks.map((c) => c.vector_score)),
    bm25_score: normalizeColumn(chunks.map((c) => c.bm25_score)),
    combined_score: normalizeColumn(chunks.map((c) => c.combined_score)),
    rerank_score: normalizeColumn(chunks.map((c) => c.rerank_score)),
  };

  return (
    <Panel title="Skor ısı haritası" icon={<Grid3x3 aria-hidden="true" />}>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <caption className="sr-only">
            Parçalar (satır) ve skor türleri (sütun) için normalize edilmiş ısı haritası
          </caption>
          <thead>
            <tr>
              <th scope="col" className="text-left font-medium text-muted-foreground">
                Parça
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="px-1 text-center font-medium text-muted-foreground"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chunks.map((c, rowIdx) => (
              <tr key={c.chunk_id}>
                <th
                  scope="row"
                  className="max-w-[10rem] truncate pr-2 text-left font-normal text-muted-foreground"
                  title={c.document_title}
                >
                  {rowIdx + 1}. {c.document_title}
                </th>
                {COLUMNS.map((col) => {
                  const raw = c[col.key];
                  const norm = normalized[col.key][rowIdx];
                  return (
                    <td key={col.key} className="p-0">
                      <div
                        className={cn(
                          "flex h-7 min-w-[3rem] items-center justify-center rounded tabular-nums",
                          intensityClass(norm),
                          raw == null && "text-muted-foreground",
                        )}
                        title={`${col.label}: ${raw == null ? "—" : formatNumber(raw, { maximumFractionDigits: 3 })}`}
                      >
                        {raw == null ? "—" : formatNumber(raw, { maximumFractionDigits: 2 })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Renk yoğunluğu her sütun içinde göreli olarak normalize edilmiştir; sayılar ham skorlardır.
      </p>
    </Panel>
  );
}
