import * as React from "react";

/**
 * Subscribe to a CSS media query and return whether it currently matches.
 * SSR-safe (returns `false` until mounted).
 *
 * @example const isMobile = useMediaQuery("(max-width: 768px)");
 */
export function useMediaQuery(query: string): boolean {
  const getMatch = React.useCallback(
    () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false),
    [query],
  );

  const [matches, setMatches] = React.useState(getMatch);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Convenience: matches the app's mobile breakpoint (≤768px). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 768px)");
}
