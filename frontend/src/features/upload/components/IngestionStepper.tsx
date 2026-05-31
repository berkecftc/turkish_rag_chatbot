import * as React from "react";
import { RotateCw, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { IngestionStatusBadge } from "@/features/ingestion/components/IngestionStatusBadge";
import { StageStepper } from "@/features/ingestion/components/StageStepper";
import { useJob, useRetryJob } from "@/features/ingestion/api";
import { isTerminalJobStatus } from "@/shared/types/enums";
import { formatPercent } from "@/shared/lib/format";
import { normalizeError } from "@/shared/lib/normalizeError";
import { toast } from "sonner";

export interface IngestionStepperProps {
  jobId: string;
  /** Notified when the job reaches a terminal state (for the parent's phase). */
  onTerminal?: (succeeded: boolean) => void;
}

/**
 * Live ingestion tracker for a single job. Polls `useJob` (which stops at
 * terminal states), renders the stage stepper + progress bar, an OCR callout
 * while the OCR stage runs, and a retry action on failure.
 */
export function IngestionStepper({ jobId, onTerminal }: IngestionStepperProps) {
  const { data: job, isLoading, isError, error, refetch } = useJob(jobId);
  const retry = useRetryJob();

  const status = job?.status;
  const stage = job?.stage;
  const terminal = status ? isTerminalJobStatus(status) : false;
  const failed = status === "failed" || status === "dead" || stage === "error";

  // Notify the parent exactly once when the job reaches a terminal state.
  React.useEffect(() => {
    if (terminal) onTerminal?.(!failed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal, failed]);

  if (isLoading || !job) {
    return (
      <div className="space-y-2">
        <Progress label="İşleme durumu yükleniyor" />
        <p className="text-xs text-muted-foreground">İşleme durumu alınıyor…</p>
      </div>
    );
  }

  if (isError) {
    const message = normalizeError(error).message;
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
        <p className="text-sm text-destructive">{message}</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Yeniden dene
        </Button>
      </div>
    );
  }

  const isOcr = job.stage === "ocr";
  // Backend `progress` is an integer 0–100 (workers/pipeline.py). Clamp defensively.
  const progressValue = Math.min(100, Math.max(0, Math.round(job.progress ?? 0)));

  function handleRetry() {
    retry.mutate(jobId, {
      onSuccess: () => toast.success("Yeniden işleme başlatıldı."),
      onError: (e) => toast.error(normalizeError(e).message),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <IngestionStatusBadge status={job.status} />
        {!failed && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatPercent(progressValue / 100)}
          </span>
        )}
      </div>

      <StageStepper stage={job.stage} failed={failed} />

      {!failed && (
        <Progress
          value={progressValue}
          label="Belge işleme ilerlemesi"
          indicatorClassName={job.status === "succeeded" ? "bg-success" : undefined}
        />
      )}

      {isOcr && !failed && (
        <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-sm text-foreground">
          <ScanText className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
          <span>
            Görsel/taranmış içerik için OCR çalışıyor. Bu adım belgenin boyutuna göre biraz
            sürebilir.
          </span>
        </div>
      )}

      {failed && (
        <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-sm text-destructive">
            {job.error?.trim() || "Belge işlenirken bir hata oluştu."}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRetry}
            disabled={retry.isPending}
          >
            <RotateCw aria-hidden="true" />
            {retry.isPending ? "Başlatılıyor…" : "Yeniden işle"}
          </Button>
        </div>
      )}
    </div>
  );
}
