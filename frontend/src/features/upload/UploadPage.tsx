import * as React from "react";
import { Link } from "react-router-dom";
import type { FileRejection } from "react-dropzone";
import { FileUp, FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dropzone } from "@/features/upload/components/Dropzone";
import { UploadList } from "@/features/upload/components/UploadList";
import { MAX_UPLOAD_MB } from "@/features/upload/constants";
import type { UploadItemState } from "@/features/upload/types";
import { formatBytes } from "@/shared/lib/format";

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

/** Maps a react-dropzone rejection to a Turkish message. */
function rejectionMessage(rejection: FileRejection): string {
  const code = rejection.errors[0]?.code;
  if (code === "file-too-large") {
    return `"${rejection.file.name}" çok büyük (en fazla ${MAX_UPLOAD_MB} MB).`;
  }
  if (code === "file-invalid-type") {
    return `"${rejection.file.name}" desteklenmeyen bir dosya türü.`;
  }
  return `"${rejection.file.name}" reddedildi.`;
}

export function UploadPage() {
  const [items, setItems] = React.useState<UploadItemState[]>([]);

  const handleAccepted = React.useCallback((files: File[]) => {
    setItems((prev) => [
      ...files.map<UploadItemState>((file) => ({
        id: nextId(),
        file,
        phase: "queued",
        progress: 0,
      })),
      ...prev,
    ]);
  }, []);

  const handleRejected = React.useCallback((rejections: FileRejection[]) => {
    for (const r of rejections) toast.error(rejectionMessage(r));
  }, []);

  const handleChange = React.useCallback((id: string, patch: Partial<UploadItemState>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const handleRemove = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clearFinished = React.useCallback(() => {
    setItems((prev) => prev.filter((it) => it.phase !== "done" && it.phase !== "failed"));
  }, []);

  const hasFinished = items.some((it) => it.phase === "done" || it.phase === "failed");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        icon={<FileUp aria-hidden="true" />}
        title="Yükleme Merkezi"
        description={`Belgelerinizi yükleyin; çıkarma, OCR, parçalama ve indeksleme adımlarını canlı izleyin. En fazla ${formatBytes(MAX_UPLOAD_MB * 1024 * 1024)}.`}
        actions={
          <Link to="/documents" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FolderOpen aria-hidden="true" />
            Belgeler
          </Link>
        }
      />

      <Dropzone onAccepted={handleAccepted} onRejected={handleRejected} />

      {items.length > 0 ? (
        <section className="space-y-3" aria-label="Yükleme kuyruğu">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {items.length} dosya
            </h2>
            {hasFinished && (
              <Button size="sm" variant="ghost" onClick={clearFinished}>
                <Trash2 aria-hidden="true" />
                Tamamlananları temizle
              </Button>
            )}
          </div>
          <UploadList items={items} onChange={handleChange} onRemove={handleRemove} />
        </section>
      ) : (
        <EmptyState
          icon={<FileUp aria-hidden="true" />}
          title="Henüz dosya seçilmedi"
          description="Yukarıdaki alana dosya sürükleyin veya tıklayarak seçin. Birden fazla dosyayı aynı anda yükleyebilirsiniz."
        />
      )}
    </div>
  );
}
