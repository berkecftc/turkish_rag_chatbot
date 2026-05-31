import * as React from "react";
import { Search as SearchIcon, SearchX } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { CardSkeleton } from "@/components/Skeletons";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { normalizeError } from "@/shared/lib/normalizeError";
import type { SearchRequest } from "@/shared/types/api";
import { useSearch } from "./api";
import { SearchBar } from "./components/SearchBar";
import { QueryUnderstanding } from "./components/QueryUnderstanding";
import { ResultList } from "./components/ResultList";

const DEFAULT_TOP_K = 10;

export function SearchPage() {
  const [input, setInput] = React.useState("");
  const [topK, setTopK] = React.useState(DEFAULT_TOP_K);
  /** Set on explicit submit (Enter) to bypass the debounce immediately. */
  const [flushed, setFlushed] = React.useState<string | null>(null);

  const debounced = useDebounce(input, 350);
  // Effective query: an explicit submit wins (when it still matches the input),
  // otherwise fall back to the debounced value.
  const query = (flushed != null && flushed === input ? flushed : debounced).trim();

  const body: SearchRequest = {
    query,
    top_k: topK,
    include_scores: true,
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useSearch(body, {
    enabled: query.length > 0,
  });

  const trimmedInput = input.trim();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        icon={<SearchIcon aria-hidden="true" />}
        title="Anlamsal Arama"
        description="Belgelerinizde anlam tabanlı, hibrit (vektör + BM25) arama yapın."
      />

      <div className="space-y-5">
        <SearchBar
          value={input}
          onChange={setInput}
          onSubmit={() => setFlushed(input)}
          topK={topK}
          onTopKChange={setTopK}
        />

        {trimmedInput.length === 0 && (
          <EmptyState
            icon={<SearchIcon aria-hidden="true" />}
            title="Aramaya başlayın"
            description="Bir sorgu yazın; sonuçlar anlam benzerliğine göre puanlanarak listelenir."
          />
        )}

        {query.length > 0 && isLoading && (
          <div className="space-y-3" aria-busy="true" aria-label="Sonuçlar yükleniyor">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {query.length > 0 && isError && (
          <ErrorState
            title="Arama başarısız"
            description={normalizeError(error).message}
            retryLabel="Yeniden dene"
            onRetry={() => refetch()}
          />
        )}

        {query.length > 0 && data && (
          <div className="space-y-5" aria-busy={isFetching}>
            <QueryUnderstanding
              originalQuery={query}
              queryIntent={data.query_intent}
              rewrittenQuery={data.rewritten_query}
              latencyMs={data.latency_ms}
            />

            {data.results.length === 0 ? (
              <EmptyState
                icon={<SearchX aria-hidden="true" />}
                title="Sonuç bulunamadı"
                description="Bu sorgu için eşleşen içerik yok. Farklı bir ifade deneyin."
              />
            ) : (
              <ResultList results={data.results} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
