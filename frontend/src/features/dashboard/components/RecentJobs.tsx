/**
 * Recent ingestion jobs panel (top 5 from /ingestion/jobs).
 * Clicking a row navigates to the related document detail page.
 */

import { Link } from "react-router-dom";
import { UploadCloud, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ListSkeleton } from "@/components/Skeletons";
import { EnumBadge } from "@/components/EnumBadge";
import { labelFor, jobStatusLabels, ingestionStageLabels } from "@/i18n/labels";
import { formatRelativeTime } from "@/shared/lib/format";
import type { JobStatusOut } from "@/shared/types/api";

const MAX_ROWS = 5;

export interface RecentJobsProps {
  jobs: JobStatusOut[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

export function RecentJobs({ jobs, loading, error, onRetry }: RecentJobsProps) {
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <UploadCloud className="size-4 text-muted-foreground" aria-hidden="true" />
          Son yüklemeler
        </h2>
        <Link to="/upload" className="text-xs font-medium text-primary hover:underline">
          Yükle
        </Link>
      </div>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState
          title="İşler yüklenemedi"
          description="Yükleme işleri alınırken bir sorun oluştu."
          retryLabel="Yeniden dene"
          onRetry={onRetry}
        />
      ) : !jobs || jobs.length === 0 ? (
        <EmptyState
          icon={<UploadCloud aria-hidden="true" />}
          title="Henüz yükleme yok"
          description="Belge yükleyerek işleme sürecini buradan takip edebilirsiniz."
        />
      ) : (
        <ul className="space-y-1">
          {jobs.slice(0, MAX_ROWS).map((job) => (
            <li key={job.id}>
              <Link
                to={`/documents/${job.document_id}`}
                className="group flex items-center gap-3 rounded-md p-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <EnumBadge entry={labelFor(jobStatusLabels, job.status)} />
                    <span className="truncate text-xs text-muted-foreground">
                      {labelFor(ingestionStageLabels, job.stage).label}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {formatRelativeTime(job.finished_at ?? job.started_at ?? job.created_at)}
                  </p>
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
