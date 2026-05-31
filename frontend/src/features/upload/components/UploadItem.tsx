import * as React from "react";
import { CheckCircle2, FileText, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useUploadDocument } from "@/features/documents/api";
import { formatBytes, formatPercent } from "@/shared/lib/format";
import { normalizeError } from "@/shared/lib/normalizeError";
import { IngestionStepper } from "@/features/upload/components/IngestionStepper";
import type { UploadItemState } from "@/features/upload/types";
import { toast } from "sonner";

export interface UploadItemProps {
  item: UploadItemState;
  /** Patches the parent-held state for this item. */
  onChange: (id: string, patch: Partial<UploadItemState>) => void;
  /** Removes this item from the list. */
  onRemove: (id: string) => void;
}

/**
 * A single file row. Owns its upload mutation (so progress stays local), then
 * transitions into the live ingestion tracker once the 202 arrives.
 */
export function UploadItem({ item, onChange, onRemove }: UploadItemProps) {
  const upload = useUploadDocument();
  // Guard so React 18 StrictMode double-effects don't double-upload.
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (startedRef.current || item.phase !== "queued") return;
    startedRef.current = true;
    onChange(item.id, { phase: "uploading", progress: 0 });

    upload.mutate(
      {
        file: item.file,
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
          onChange(item.id, { progress: pct });
        },
      },
      {
        onSuccess: (res) => {
          onChange(item.id, {
            phase: "ingesting",
            progress: 100,
            upload: res,
            jobId: res.job_id,
          });
          if (res.is_duplicate) {
            toast.info(`"${item.file.name}" zaten mevcut (sürüm ${res.version}).`);
          }
        },
        onError: (e) => {
          const message = normalizeError(e).message;
          onChange(item.id, { phase: "failed", error: message });
          toast.error(`"${item.file.name}" yüklenemedi: ${message}`);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.phase]);

  const { phase } = item;
  const removable = phase === "done" || phase === "failed" || phase === "queued";

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
          <FileText aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground" title={item.file.name}>
              {item.file.name}
            </p>
            {item.upload?.is_duplicate && (
              <Badge variant="warning" className="shrink-0">
                Zaten mevcut
              </Badge>
            )}
            {item.upload && (
              <Badge variant="outline" className="shrink-0">
                Sürüm {item.upload.version}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
        </div>
        {removable && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            aria-label={`"${item.file.name}" öğesini listeden kaldır`}
            onClick={() => onRemove(item.id)}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>

      {(phase === "queued" || phase === "uploading") && (
        <div className="space-y-1.5">
          <Progress
            value={phase === "uploading" ? item.progress : undefined}
            label="Yükleme ilerlemesi"
          />
          <p className="text-xs text-muted-foreground">
            {phase === "queued"
              ? "Sırada…"
              : `Yükleniyor — ${formatPercent(item.progress / 100)}`}
          </p>
        </div>
      )}

      {(phase === "ingesting" || phase === "done") && item.jobId && (
        <IngestionStepper
          jobId={item.jobId}
          onTerminal={(succeeded) =>
            onChange(item.id, { phase: succeeded ? "done" : "failed" })
          }
        />
      )}

      {phase === "done" && (
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <span>Belge başarıyla işlendi.</span>
        </div>
      )}

      {phase === "failed" && item.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {item.error}
        </p>
      )}
    </Card>
  );
}
