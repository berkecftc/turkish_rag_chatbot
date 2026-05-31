import { Loader2 } from "lucide-react";
import { EnumBadge } from "@/components/EnumBadge";
import { jobStatusLabels, labelFor } from "@/i18n/labels";
import { isTerminalJobStatus, type JobStatus } from "@/shared/types/enums";

export interface IngestionStatusBadgeProps {
  status: JobStatus;
  /** Show an animated spinner while the job is in a non-terminal state. */
  showSpinner?: boolean;
  className?: string;
}

/**
 * Badge for an ingestion job's overall {@link JobStatus}. Shared between the
 * upload tracker (Phase 6) and the document detail view (Phase 7).
 */
export function IngestionStatusBadge({
  status,
  showSpinner = true,
  className,
}: IngestionStatusBadgeProps) {
  const entry = labelFor(jobStatusLabels, status);
  const spinning = showSpinner && !isTerminalJobStatus(status);
  return (
    <EnumBadge
      entry={entry}
      className={className}
      icon={
        spinning ? (
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        ) : undefined
      }
    />
  );
}
