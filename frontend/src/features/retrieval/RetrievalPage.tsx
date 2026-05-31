import { useParams } from "react-router-dom";
import { Microscope } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { CardSkeleton } from "@/components/Skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeError } from "@/shared/lib/normalizeError";
import { useDebug } from "@/features/rag/api";
import { RetrievalHeader } from "./components/RetrievalHeader";
import { QueryPanel } from "./components/QueryPanel";
import { HybridWeights } from "./components/HybridWeights";
import { LatencyBreakdown } from "./components/LatencyBreakdown";
import { ContextAllocation } from "./components/ContextAllocation";
import { ScoreHeatmap } from "./components/ScoreHeatmap";
import { ChunkDebugTable } from "./components/ChunkDebugTable";

export function RetrievalPage() {
  const { messageId } = useParams<{ messageId: string }>();
  const { data, isLoading, isError, error, refetch } = useDebug(messageId);

  const header = (
    <PageHeader
      icon={<Microscope aria-hidden="true" />}
      title="Getirim İncelemesi"
      description="Bir yanıtın getirim, sıralama ve bağlam oluşturma sürecini şeffaf biçimde inceleyin."
    />
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        {header}
        <div className="space-y-4" aria-busy="true" aria-label="Getirim kaydı yükleniyor">
          <Skeleton className="h-12 w-full rounded-lg" />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (isError) {
    const normalized = normalizeError(error);
    // 404 → no retrieval log was recorded for this message.
    if (normalized.status === 404) {
      return (
        <div className="mx-auto max-w-5xl">
          {header}
          <EmptyState
            icon={<Microscope aria-hidden="true" />}
            title="Bu mesaj için getirim kaydı yok"
            description="Yalnızca hata ayıklama etkinken üretilen yanıtlar için getirim ayrıntıları saklanır."
          />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-5xl">
        {header}
        <ErrorState
          title="Getirim kaydı yüklenemedi"
          description={normalized.message}
          retryLabel="Yeniden dene"
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl">
        {header}
        <EmptyState
          icon={<Microscope aria-hidden="true" />}
          title="Getirim kaydı bulunamadı"
          description={`Mesaj: ${messageId ?? "—"}`}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {header}
      <div className="space-y-4">
        <RetrievalHeader
          messageId={data.message_id}
          cacheHit={data.cache_hit}
          confidenceScore={data.confidence_score}
        />

        <QueryPanel
          originalQuery={data.original_query}
          rewrittenQuery={data.rewritten_query}
          queryIntent={data.query_intent}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <HybridWeights vectorWeight={data.vector_weight} bm25Weight={data.bm25_weight} />
          <LatencyBreakdown
            retrievalMs={data.retrieval_latency_ms}
            rerankMs={data.rerank_latency_ms}
            generationMs={data.generation_latency_ms}
            totalMs={data.total_latency_ms}
          />
        </div>

        <ContextAllocation
          chunks={data.retrieved_chunks}
          contextTokens={data.context_tokens}
          wasCompressed={data.was_compressed}
        />

        <ScoreHeatmap chunks={data.retrieved_chunks} />

        <ChunkDebugTable chunks={data.retrieved_chunks} />
      </div>
    </div>
  );
}
