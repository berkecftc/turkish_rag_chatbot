/**
 * Shared recharts theming helpers — tooltip styling + x-axis date formatting.
 * Colors are passed in from `useChartColors` (token-resolved), never hardcoded.
 */

import { formatNumber, formatDate } from "@/shared/lib/format";

/** Short day/month label for time-series x-axis ticks. */
export function shortDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(d);
}

export interface TokenTooltipFormatterOptions {
  /** Suffix appended to the value, e.g. "token", "ms". */
  unit?: string;
  /** Treat x-axis label as an ISO date and format it. */
  dateLabel?: boolean;
}

interface TooltipEntry {
  color?: string;
  name?: string | number;
  value?: number | string | Array<number | string>;
}

interface ChartTooltipProps extends TokenTooltipFormatterOptions {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
}

/** Token-themed tooltip; recharts injects active/payload/label at runtime. */
export function ChartTooltip({
  active,
  payload,
  label,
  unit,
  dateLabel = true,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const heading = dateLabel && typeof label === "string" ? formatDate(label) : String(label ?? "");
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{heading}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: entry.color }}
            aria-hidden="true"
          />
          <span className="tabular-nums text-foreground">
            {formatNumber(entry.value as number)}
            {unit ? ` ${unit}` : ""}
          </span>
          {entry.name ? <span>· {entry.name}</span> : null}
        </p>
      ))}
    </div>
  );
}
