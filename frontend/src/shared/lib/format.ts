/**
 * Pure formatting helpers. All locale-aware output uses `tr-TR`.
 * Every function is null/0 safe and returns a sensible placeholder ("—") for
 * missing input rather than throwing.
 */

const LOCALE = "tr-TR";
const EMPTY = "—";

/** Format a byte count into a human-readable size (e.g. 1536 → "1,5 KB"). */
export function formatBytes(bytes: number | null | undefined, fractionDigits = 1): string {
  if (bytes == null || !Number.isFinite(bytes)) return EMPTY;
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  const digits = i === 0 ? 0 : fractionDigits; // bytes are whole numbers
  return `${formatNumber(value, { maximumFractionDigits: digits })} ${units[i]}`;
}

function toDate(input: string | number | Date | null | undefined): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date only, e.g. "31 May 2026". */
export function formatDate(input: string | number | Date | null | undefined): string {
  const d = toDate(input);
  if (!d) return EMPTY;
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Date + time, e.g. "31 May 2026 14:05". */
export function formatDateTime(input: string | number | Date | null | undefined): string {
  const d = toDate(input);
  if (!d) return EMPTY;
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const RELATIVE_DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

/** Relative time in Turkish, e.g. "3 dakika önce", "yarın". */
export function formatRelativeTime(
  input: string | number | Date | null | undefined,
  now: Date = new Date(),
): string {
  const d = toDate(input);
  if (!d) return EMPTY;
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  let duration = (d.getTime() - now.getTime()) / 1000; // seconds, signed
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return EMPTY;
}

/**
 * Format a 0..1 ratio (or 0..100 when `alreadyPercent`) as a percentage.
 * e.g. 0.873 → "%87" (or "%87,3" with fractionDigits=1).
 */
export function formatPercent(
  value: number | null | undefined,
  { fractionDigits = 0, alreadyPercent = false }: { fractionDigits?: number; alreadyPercent?: boolean } = {},
): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  const ratio = alreadyPercent ? value / 100 : value;
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ratio);
}

/** Human latency from milliseconds, e.g. 850 → "850 ms", 1500 → "1,5 sn". */
export function formatLatency(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return EMPTY;
  if (ms < 0) return EMPTY;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${formatNumber(seconds, { maximumFractionDigits: 1 })} sn`;
  const minutes = Math.floor(seconds / 60);
  const remSec = Math.round(seconds % 60);
  return remSec === 0 ? `${minutes} dk` : `${minutes} dk ${remSec} sn`;
}

/** Locale-aware number formatting (tr-TR). */
export function formatNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  return new Intl.NumberFormat(LOCALE, options).format(value);
}

/** Truncate a string to `max` chars, appending an ellipsis when cut. */
export function truncate(
  input: string | null | undefined,
  max: number,
  ellipsis = "…",
): string {
  if (!input) return "";
  if (max <= 0) return "";
  if (input.length <= max) return input;
  return input.slice(0, Math.max(0, max - ellipsis.length)).trimEnd() + ellipsis;
}
