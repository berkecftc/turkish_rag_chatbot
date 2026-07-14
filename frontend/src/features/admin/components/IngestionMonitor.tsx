import * as React from "react";
import { RotateCw, ListChecks, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { RealBadge } from "@/features/analytics/components/SampleBadge";
import { IngestionStatusBadge } from "@/features/ingestion/components/IngestionStatusBadge";
import { useJobs, useRetryJob } from "@/features/ingestion/api";
import { usePermissions } from "@/shared/lib/jwt";
import { formatRelativeTime, truncate } from "@/shared/lib/format";
import { cn } from "@/lib/utils";
import type { JobStatusOut } from "@/shared/types/api";
import type { JobStatus } from "@/shared/types/enums";

const STATUS_ORDER: JobStatus[] = [
  "queued",
  "running",
  "retrying",
  "succeeded",
  "failed",
  "dead",
];

function countByStatus(jobs: JobStatusOut[]): Record<JobStatus, number> {
  const counts = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    retrying: 0,
    dead: 0,
  } as Record<JobStatus, number>;
  for (const j of jobs) {
    if (j.status in counts) counts[j.status] += 1;
  }
  return counts;
}

function isFailedLike(status: JobStatus): boolean {
  return status === "failed" || status === "dead";
}

function FailedJobRow({
  job,
  canRetry,
}: {
  job: JobStatusOut;
  canRetry: boolean;
}) {
  const retry = useRetryJob();
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <IngestionStatusBadge status={job.status} showSpinner={false} />
          <code className="truncate font-mono text-xs text-muted-foreground">{job.document_id}</code>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(job.finished_at ?? job.created_at)}
          </span>
        </div>
        {job.error && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            <span className="break-words">{truncate(job.error, 240)}</span>
          </p>
        )}
      </div>
      {canRetry && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={retry.isPending}
          onClick={() => retry.mutate(job.id)}
        >
          <RotateCw
            className={cn("size-3.5", retry.isPending && "animate-spin")}
            aria-hidden="true"
          />
          Yeniden dene
        </Button>
      )}
    </li>
  );
}

/** REAL ingestion monitoring derived from GET /ingestion/jobs. */
export function IngestionMonitor() {
  const { data, isLoading, isError, refetch } = useJobs({ limit: 100 });
  const { has } = usePermissions();
  const canRetry = has("ingestion:write") || has("documents:write");

  const jobs = React.useMemo(() => data ?? [], [data]);

  const counts = React.useMemo(() => countByStatus(jobs), [jobs]);
  const failed = React.useMemo(
    () => jobs.filter((j) => isFailedLike(j.status)),
    [jobs],
  );

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">Yükleme durumu özeti</h3>
          <RealBadge />
        </div>

        {isLoading && <LoadingState className="py-8" srLabel="İşler yükleniyor" />}

        {isError && !isLoading && (
          <div className="mt-4">
            <ErrorState
              className="py-8"
              title="İşler alınamadı"
              description="Yükleme işleri uç noktasına ulaşılamadı."
              retryLabel="Tekrar dene"
              onRetry={() => void refetch()}
            />
          </div>
        )}

        {data && !isLoading && !isError && (
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {STATUS_ORDER.map((status) => (
              <div
                key={status}
                className="rounded-lg border border-border bg-muted/20 px-3 py-2.5"
              >
                <dt className="mb-1">
                  <IngestionStatusBadge status={status} showSpinner={false} />
                </dt>
                <dd className="text-xl font-semibold tabular-nums text-foreground">
                  {counts[status]}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">
            Başarısız / sonlandırılan işler
          </h3>
        </div>

        {!isLoading && !isError && failed.length === 0 && (
          <EmptyState
            className="mt-4 py-8"
            icon={<ListChecks aria-hidden="true" />}
            title="Başarısız iş yok"
            description="Tüm yükleme işleri sağlıklı görünüyor."
          />
        )}

        {failed.length > 0 && (
          <ul className="mt-4 space-y-2">
            {failed.map((job) => (
              <FailedJobRow key={job.id} job={job} canRetry={canRetry} />
            ))}
          </ul>
        )}

        {!canRetry && failed.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Yeniden deneme için yazma izni gereklidir.
          </p>
        )}
      </Card>
    </div>
  );
}
