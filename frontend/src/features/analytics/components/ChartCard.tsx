/**
 * Card frame for a single analytics chart.
 *
 * Always shows a provenance badge (sample vs real) in the header so the
 * mock/real distinction is unmistakable. Handles loading skeleton + a fixed
 * chart height region. The chart body itself gets a `role="img"` + aria-label
 * (passed via `ariaLabel`) for accessibility, plus an optional collapsible data
 * table fallback for screen readers / non-visual consumers.
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProvenanceBadge } from "./SampleBadge";

export interface ChartCardProps {
  title: string;
  description?: string;
  isSample: boolean;
  loading?: boolean;
  /** Concise summary of the chart contents for assistive tech. */
  ariaLabel: string;
  /** Optional screen-reader data-table fallback. */
  tableFallback?: React.ReactNode;
  /** Fixed pixel height of the plotting region. */
  height?: number;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  description,
  isSample,
  loading = false,
  ariaLabel,
  tableFallback,
  height = 240,
  children,
}: ChartCardProps) {
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <ProvenanceBadge isSample={isSample} />
      </div>
      {description && (
        <p className="mb-3 text-xs text-muted-foreground">{description}</p>
      )}

      <div className="mt-auto" style={{ height }}>
        {loading ? (
          <Skeleton className="size-full rounded-md" />
        ) : (
          <div role="img" aria-label={ariaLabel} className="size-full">
            {children}
          </div>
        )}
      </div>

      {tableFallback && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Veri tablosu
          </summary>
          <div className="mt-2 overflow-x-auto">{tableFallback}</div>
        </details>
      )}
    </Card>
  );
}
