import type { SearchResultItem } from "@/shared/types/api";
import { ResultCard } from "./ResultCard";

export interface ResultListProps {
  results: SearchResultItem[];
}

/** Renders the list of search result cards with an accessible result count. */
export function ResultList({ results }: ResultListProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {results.length} sonuç bulundu
      </p>
      <ul className="grid gap-3">
        {results.map((r) => (
          <li key={r.chunk_id}>
            <ResultCard result={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}
