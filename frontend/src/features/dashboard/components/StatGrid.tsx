/**
 * Workspace stat cards — built ONLY from real list endpoints.
 *
 * Honesty notes:
 *  - Document & job counts are taken from a *fetched page* (limit-capped). The
 *    hints make the page-limited nature explicit ("ilk N kayıt") so a count is
 *    never overstated as a guaranteed total.
 *  - Ingestion health is a real ratio computed from the fetched jobs page
 *    (succeeded vs failed/dead).
 */

import { FileText, MessagesSquare, Activity, UploadCloud } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { formatNumber, formatPercent } from "@/shared/lib/format";
import type { DocumentOut, JobStatusOut, ConversationOut } from "@/shared/types/api";

/** Fetched page size used for the count cards (kept in sync with the page). */
export const DASHBOARD_PAGE_LIMIT = 100;

export interface IngestionHealth {
  /** Succeeded / (succeeded + failed + dead) over the fetched page. */
  successRate: number | null;
  succeeded: number;
  failing: number;
  total: number;
}

export function computeIngestionHealth(jobs: JobStatusOut[]): IngestionHealth {
  let succeeded = 0;
  let failing = 0;
  for (const job of jobs) {
    if (job.status === "succeeded") succeeded += 1;
    else if (job.status === "failed" || job.status === "dead") failing += 1;
  }
  const denom = succeeded + failing;
  return {
    successRate: denom > 0 ? succeeded / denom : null,
    succeeded,
    failing,
    total: jobs.length,
  };
}

export interface StatGridProps {
  documents: DocumentOut[] | undefined;
  conversations: ConversationOut[] | undefined;
  jobs: JobStatusOut[] | undefined;
  loading: boolean;
}

export function StatGrid({ documents, conversations, jobs, loading }: StatGridProps) {
  const docCount = documents?.length ?? 0;
  const convCount = conversations?.length ?? 0;
  const jobsList = jobs ?? [];
  const health = computeIngestionHealth(jobsList);

  const pageHint = (n: number) =>
    n >= DASHBOARD_PAGE_LIMIT ? `ilk ${DASHBOARD_PAGE_LIMIT} kayıt` : "yüklenen kayıtlar";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        loading={loading}
        label="Belgeler"
        value={formatNumber(docCount)}
        icon={<FileText aria-hidden="true" />}
        hint={pageHint(docCount)}
      />
      <StatCard
        loading={loading}
        label="Sohbetler"
        value={formatNumber(convCount)}
        icon={<MessagesSquare aria-hidden="true" />}
        hint={pageHint(convCount)}
      />
      <StatCard
        loading={loading}
        label="Yükleme işleri"
        value={formatNumber(health.total)}
        icon={<UploadCloud aria-hidden="true" />}
        hint={pageHint(health.total)}
      />
      <StatCard
        loading={loading}
        label="İşleme başarısı"
        value={health.successRate == null ? "—" : formatPercent(health.successRate)}
        icon={<Activity aria-hidden="true" />}
        hint={
          health.successRate == null
            ? "tamamlanan iş yok"
            : `${formatNumber(health.succeeded)} başarılı · ${formatNumber(health.failing)} hatalı`
        }
      />
    </div>
  );
}
