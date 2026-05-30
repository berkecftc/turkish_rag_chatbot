import * as React from "react";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfidenceTone = "high" | "med" | "low";

export interface ConfidenceBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Explicit tone. If omitted, derived from `score`. */
  tone?: ConfidenceTone;
  /** Confidence score in 0–1. Used to derive tone and the displayed %. */
  score?: number;
  /** Visible label. Falls back to none (icon + % only). */
  label?: React.ReactNode;
  /** Show the numeric percentage when `score` is provided. Default true. */
  showPercent?: boolean;
}

/** Thresholds for deriving tone from a 0–1 score. */
const HIGH_THRESHOLD = 0.75;
const MED_THRESHOLD = 0.5;

function toneFromScore(score: number): ConfidenceTone {
  if (score >= HIGH_THRESHOLD) return "high";
  if (score >= MED_THRESHOLD) return "med";
  return "low";
}

const toneStyles: Record<ConfidenceTone, string> = {
  high: "border-confidence-high/30 bg-confidence-high/10 text-confidence-high",
  med: "border-confidence-med/30 bg-confidence-med/10 text-confidence-med",
  low: "border-confidence-low/30 bg-confidence-low/10 text-confidence-low",
};

const toneIcon: Record<ConfidenceTone, React.ReactNode> = {
  high: <ShieldCheck aria-hidden="true" />,
  med: <ShieldQuestion aria-hidden="true" />,
  low: <ShieldAlert aria-hidden="true" />,
};

const ConfidenceBadge = React.forwardRef<HTMLSpanElement, ConfidenceBadgeProps>(
  ({ className, tone, score, label, showPercent = true, ...props }, ref) => {
    const resolved: ConfidenceTone = tone ?? (score !== undefined ? toneFromScore(score) : "med");
    const percent =
      showPercent && score !== undefined ? `${Math.round(score * 100)}%` : null;

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3.5",
          toneStyles[resolved],
          className,
        )}
        {...props}
      >
        {toneIcon[resolved]}
        {label}
        {percent && <span className="tabular-nums">{percent}</span>}
      </span>
    );
  },
);
ConfidenceBadge.displayName = "ConfidenceBadge";

export { ConfidenceBadge };
