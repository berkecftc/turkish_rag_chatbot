/**
 * Resolves the design-system chart tokens (`--chart-1..6`) and a few semantic
 * tokens into concrete color strings that recharts can consume.
 *
 * WHY: recharts needs real color strings (it can't read `hsl(var(--x))`
 * indirection on SVG attributes reliably). The CSS variables hold raw HSL
 * channels (e.g. `221 83% 53%`), so we read the computed value off
 * `document.documentElement` and wrap it as `hsl(<channels>)`.
 *
 * THEME-SAFE: re-resolves whenever the `dark` class on <html> toggles (observed
 * via MutationObserver) so colors stay correct in light AND dark mode without
 * hardcoding any brand hex.
 */

import * as React from "react";

const CHART_VARS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--chart-6",
] as const;

const SEMANTIC_VARS = {
  success: "--success",
  destructive: "--destructive",
  warning: "--warning",
  muted: "--muted-foreground",
  border: "--border",
  grid: "--border",
  foreground: "--foreground",
} as const;

export interface ChartColors {
  /** Six theme chart colors as `hsl(...)` strings. */
  series: string[];
  success: string;
  destructive: string;
  warning: string;
  muted: string;
  border: string;
  grid: string;
  foreground: string;
}

function readVar(styles: CSSStyleDeclaration, name: string): string {
  const raw = styles.getPropertyValue(name).trim();
  // Tokens are raw HSL channels ("221 83% 53%"); wrap them. If a token is ever
  // already a full color, this guard leaves it untouched.
  if (!raw) return "hsl(0 0% 50%)";
  return raw.startsWith("hsl") || raw.startsWith("#") || raw.startsWith("rgb")
    ? raw
    : `hsl(${raw})`;
}

function resolveColors(): ChartColors {
  if (typeof window === "undefined") {
    // SSR / non-DOM fallback — neutral grays, never brand hex.
    const gray = "hsl(0 0% 50%)";
    return {
      series: Array(CHART_VARS.length).fill(gray),
      success: gray,
      destructive: gray,
      warning: gray,
      muted: gray,
      border: gray,
      grid: gray,
      foreground: gray,
    };
  }
  const styles = getComputedStyle(document.documentElement);
  return {
    series: CHART_VARS.map((v) => readVar(styles, v)),
    success: readVar(styles, SEMANTIC_VARS.success),
    destructive: readVar(styles, SEMANTIC_VARS.destructive),
    warning: readVar(styles, SEMANTIC_VARS.warning),
    muted: readVar(styles, SEMANTIC_VARS.muted),
    border: readVar(styles, SEMANTIC_VARS.border),
    grid: readVar(styles, SEMANTIC_VARS.grid),
    foreground: readVar(styles, SEMANTIC_VARS.foreground),
  };
}

/**
 * Returns theme-resolved chart colors, recomputed when the theme class on
 * <html> changes (light ↔ dark).
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = React.useState<ChartColors>(() => resolveColors());

  React.useEffect(() => {
    const update = () => setColors(resolveColors());
    // Re-resolve immediately (handles hydration mismatch / first paint).
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);

  return colors;
}
