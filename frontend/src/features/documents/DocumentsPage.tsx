import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, FilePlus2, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { TableSkeleton } from "@/components/Skeletons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { useDocuments, useDeleteDocument } from "@/features/documents/api";
import {
  DocumentTable,
  type SortDir,
  type SortKey,
} from "@/features/documents/components/DocumentTable";
import { DocumentCard } from "@/features/documents/components/DocumentCard";
import {
  DocumentFilters,
  type StatusFilter,
} from "@/features/documents/components/DocumentFilters";
import { useIsMobile } from "@/shared/hooks/useMediaQuery";
import { usePermissions } from "@/shared/lib/jwt";
import { normalizeError } from "@/shared/lib/normalizeError";
import type { DocumentOut } from "@/shared/types/api";

const PAGE_SIZE = 20;

function sortDocs(docs: DocumentOut[], key: SortKey, dir: SortDir): DocumentOut[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...docs].sort((a, b) => {
    if (key === "title") return sign * a.title.localeCompare(b.title, "tr");
    if (key === "size_bytes") return sign * (a.size_bytes - b.size_bytes);
    // created_at
    return sign * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  });
}

export function DocumentsPage() {
  const isMobile = useIsMobile();
  const { has } = usePermissions();
  const canWrite = has("document:write");
  const canDelete = has("document:delete");
  const [page, setPage] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("created_at");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [pendingDelete, setPendingDelete] = React.useState<DocumentOut | null>(null);

  const offset = page * PAGE_SIZE;
  // Fetch one extra to detect whether a next page exists.
  const query = useDocuments({ limit: PAGE_SIZE + 1, offset });
  const del = useDeleteDocument();

  const raw = query.data ?? [];
  const hasNext = raw.length > PAGE_SIZE;
  const pageItems = hasNext ? raw.slice(0, PAGE_SIZE) : raw;

  const visible = React.useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr");
    const filtered = pageItems.filter((d) => {
      const matchesSearch = !term || d.title.toLocaleLowerCase("tr").includes(term);
      const matchesStatus = status === "all" || d.status === status;
      return matchesSearch && matchesStatus;
    });
    return sortDocs(filtered, sortKey, sortDir);
  }, [pageItems, search, status, sortKey, sortDir]);

  const handleSort = React.useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir(key === "title" ? "asc" : "desc");
      return key;
    });
  }, []);

  function confirmDelete() {
    if (!pendingDelete) return;
    const doc = pendingDelete;
    del.mutate(doc.id, {
      onSuccess: () => {
        toast.success(`"${doc.title}" silindi.`);
        setPendingDelete(null);
      },
      onError: (e) => {
        toast.error(normalizeError(e).message);
        setPendingDelete(null);
      },
    });
  }

  const header = (
    <PageHeader
      icon={<FolderOpen aria-hidden="true" />}
      title="Belgeler"
      description="Yüklediğiniz belgeleri arayın, filtreleyin ve yönetin."
      actions={
        canWrite ? (
          <Link to="/upload" className={buttonVariants({ size: "sm" })}>
            <FilePlus2 aria-hidden="true" />
            Yükle
          </Link>
        ) : undefined
      }
    />
  );

  // ── States ──────────────────────────────────────────────────────────────
  if (query.isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <TableSkeleton rows={8} columns={isMobile ? 1 : 7} />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          title="Belgeler yüklenemedi"
          description={normalizeError(query.error).message}
          retryLabel="Yeniden dene"
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const emptyOnFirstPage = pageItems.length === 0 && page === 0;
  const noMatches = pageItems.length > 0 && visible.length === 0;

  return (
    <div className="space-y-6">
      {header}

      {emptyOnFirstPage ? (
        <EmptyState
          icon={<FolderOpen aria-hidden="true" />}
          title="Henüz belge yok"
          description={
            canWrite
              ? "İlk belgenizi yükleyerek başlayın. Yükleme sonrası işleme adımlarını canlı izleyebilirsiniz."
              : "Bu hesabın belge yükleme izni yok. Belgeler burada listelenecek."
          }
          action={
            canWrite ? (
              <Link to="/upload" className={buttonVariants({ size: "sm" })}>
                <FilePlus2 aria-hidden="true" />
                Belge yükle
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <DocumentFilters
            search={search}
            onSearchChange={setSearch}
            status={status}
            onStatusChange={setStatus}
          />

          {noMatches ? (
            <EmptyState
              title="Eşleşen belge yok"
              description="Arama veya filtre ölçütlerinizi değiştirmeyi deneyin."
            />
          ) : isMobile ? (
            <div className="space-y-3">
              {visible.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onDelete={canDelete ? setPendingDelete : undefined}
                />
              ))}
            </div>
          ) : (
            <DocumentTable
              docs={visible}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onDelete={canDelete ? setPendingDelete : undefined}
            />
          )}

          {/* Pagination */}
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
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        tone="destructive"
        title="Belgeyi sil"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`
            : undefined
        }
        confirmLabel="Sil"
        busy={del.isPending}
        onConfirm={confirmDelete}
        onCancel={() => !del.isPending && setPendingDelete(null)}
      />
    </div>
  );
}
