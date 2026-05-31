import * as React from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * no changes. Useful for search-as-you-type without firing a request per
 * keystroke.
 */
export function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
