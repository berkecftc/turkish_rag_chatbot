import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EnumBadge } from "@/components/EnumBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocument, useDeleteDocument } from "@/features/documents/api";
import { DocumentChunksTab } from "@/features/documents/components/DocumentChunksTab";
import {
  documentSourceLabels,
  documentStatusLabels,
  labelFor,
} from "@/i18n/labels";
import { formatBytes, formatDateTime } from "@/shared/lib/format";
import { usePermissions } from "@/shared/lib/jwt";
import { normalizeError } from "@/shared/lib/normalizeError";
import type { DocumentOut } from "@/shared/types/api";

/**
 * `DocumentOut` carries no `version` field and there is no document
 * version-list endpoint (Phase 0). We therefore only surface a version if the
 * payload happens to include one; otherwise the row shows "—".
 */
function readVersion(doc: DocumentOut): number | undefined {
  const v = (doc as DocumentOut & { version?: number }).version;
  return typeof v === "number" ? v : undefined;
}

function MetadataItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = useDocument(id);
  const del = useDeleteDocument();
  const { has } = usePermissions();
  const canDelete = has("document:delete");
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const backLink = (
    <Link
      to="/documents"
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      <ArrowLeft aria-hidden="true" />
      Belgeler
    </Link>
  );

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        {backLink}
        <Skeleton className="h-9 w-1/2" />
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        {backLink}
        <ErrorState
          title="Belge yüklenemedi"
          description={
            query.error ? normalizeError(query.error).message : "Belge bulunamadı."
          }
          retryLabel="Yeniden dene"
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const doc = query.data;
  const version = readVersion(doc);

  function handleDelete() {
    del.mutate(doc.id, {
      onSuccess: () => {
        toast.success(`"${doc.title}" silindi.`);
        navigate("/documents");
      },
      onError: (e) => {
        toast.error(normalizeError(e).message);
        setConfirmOpen(false);
      },
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {backLink}

      <PageHeader
        icon={<FileText aria-hidden="true" />}
        title={doc.title}
        description="Belge meta verileri ve parçaları."
        actions={
          canDelete ? (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 aria-hidden="true" />
              Sil
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Genel</TabsTrigger>
          <TabsTrigger value="chunks">Parçalar</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 p-6 sm:grid-cols-3">
              <MetadataItem label="Durum">
                <EnumBadge entry={labelFor(documentStatusLabels, doc.status)} />
              </MetadataItem>
              <MetadataItem label="Kaynak">
                <EnumBadge entry={labelFor(documentSourceLabels, doc.source_type)} />
              </MetadataItem>
              <MetadataItem label="MIME türü">
                <span className="break-all font-mono text-xs">{doc.mime_type}</span>
              </MetadataItem>
              <MetadataItem label="Boyut">{formatBytes(doc.size_bytes)}</MetadataItem>
              <MetadataItem label="Sayfa sayısı">{doc.page_count ?? "—"}</MetadataItem>
              <MetadataItem label="Dil">
                <span className="uppercase">{doc.language}</span>
              </MetadataItem>
              <MetadataItem label="Sürüm">{version ?? "—"}</MetadataItem>
              <MetadataItem label="Oluşturulma">
                {formatDateTime(doc.created_at)}
              </MetadataItem>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chunks">
          <DocumentChunksTab documentId={doc.id} documentReady={doc.status === "ready"} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmOpen}
        tone="destructive"
        title="Belgeyi sil"
        description={`"${doc.title}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`}
        confirmLabel="Sil"
        busy={del.isPending}
        onConfirm={handleDelete}
        onCancel={() => !del.isPending && setConfirmOpen(false)}
      />
    </div>
  );
}
