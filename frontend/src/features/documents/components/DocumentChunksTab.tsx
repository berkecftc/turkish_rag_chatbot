import * as React from "react";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ListSkeleton } from "@/components/Skeletons";
import { Button } from "@/components/ui/button";
import { ChunkList } from "@/features/documents/components/ChunkList";
import { useDocumentChunks } from "@/features/ingestion/api";
import { normalizeError } from "@/shared/lib/normalizeError";

const CHUNK_PAGE_SIZE = 50;

export interface DocumentChunksTabProps {
  documentId: string;
  /** Document status — drives the "still ingesting" empty-state copy. */
  documentReady: boolean;
}

/** Paginated chunks view for the document detail "Parçalar" tab. */
export function DocumentChunksTab({ documentId, documentReady }: DocumentChunksTabProps) {
  const [page, setPage] = React.useState(0);
  const offset = page * CHUNK_PAGE_SIZE;
  // Over-fetch by one to know whether a next page exists.
  const query = useDocumentChunks(documentId, { limit: CHUNK_PAGE_SIZE + 1, offset });

  const raw = query.data ?? [];
  const hasNext = raw.length > CHUNK_PAGE_SIZE;
  const chunks = hasNext ? raw.slice(0, CHUNK_PAGE_SIZE) : raw;

  if (query.isLoading) return <ListSkeleton rows={6} />;

  if (query.isError) {
    return (
      <ErrorState
        title="Parçalar yüklenemedi"
        description={normalizeError(query.error).message}
        retryLabel="Yeniden dene"
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (chunks.length === 0 && page === 0) {
    return (
      <EmptyState
        icon={<Layers aria-hidden="true" />}
        title="Henüz parça yok"
        description={
          documentReady
            ? "Bu belge için parça bulunamadı."
            : "Belge hâlâ işleniyor olabilir. İşleme tamamlandığında parçalar burada görünecek."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <ChunkList chunks={chunks} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Sayfa {page + 1}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft aria-hidden="true" />
            Önceki
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
          >
            Sonraki
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
