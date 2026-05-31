import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { formatPercent } from "@/shared/lib/format";

type Tone = "high" | "med" | "low";

const HIGH_THRESHOLD = 0.75;
const MED_THRESHOLD = 0.5;
const SEGMENTS = 5;

function toneFromScore(score: number): Tone {
  if (score >= HIGH_THRESHOLD) return "high";
  if (score >= MED_THRESHOLD) return "med";
  return "low";
}

const TONE_BG: Record<Tone, string> = {
  high: "bg-confidence-high",
  med: "bg-confidence-med",
  low: "bg-confidence-low",
};
const TONE_TEXT: Record<Tone, string> = {
  high: "text-confidence-high",
  med: "text-confidence-med",
  low: "text-confidence-low",
};
const TONE_LABEL: Record<Tone, string> = {
  high: "Yüksek güven",
  med: "Orta güven",
  low: "Düşük güven",
};

export interface ConfidenceMeterProps {
  /** 0..1 confidence score. */
  score?: number;
  /** Hallucination warning codes (rendered as a warning chip when non-empty). */
  hallucinationFlags?: string[];
  className?: string;
}

/**
 * Segmented confidence bar derived from a 0..1 score, with a tone-colored fill,
 * an explanatory tooltip, and an optional hallucination warning chip.
 */
export function ConfidenceMeter({ score, hallucinationFlags, className }: ConfidenceMeterProps) {
  const hasScore = score != null && Number.isFinite(score);
  const tone = hasScore ? toneFromScore(score as number) : "med";
  const filled = hasScore ? Math.round((score as number) * SEGMENTS) : 0;
  const flags = hallucinationFlags ?? [];

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {hasScore && (
        <Tooltip
          content={
            <span className="block max-w-[15rem]">
              Yanıtın getirilen kaynaklara dayanma düzeyi. Yüksek değer, içeriğin
              belgelerle güçlü şekilde desteklendiğini gösterir.
            </span>
          }
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="flex items-center gap-0.5" aria-hidden="true">
              {Array.from({ length: SEGMENTS }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 w-3 rounded-full",
                    i < filled ? TONE_BG[tone] : "bg-muted",
                  )}
                />
              ))}
            </span>
            <span className={cn("text-xs font-medium tabular-nums", TONE_TEXT[tone])}>
              {TONE_LABEL[tone]} · {formatPercent(score)}
            </span>
          </span>
        </Tooltip>
      )}

      {flags.length > 0 && (
        <Tooltip content={`Olası tutarsızlıklar: ${flags.join(", ")}`}>
          <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            Doğrulama uyarısı ({flags.length})
          </span>
        </Tooltip>
      )}
    </div>
  );
}
