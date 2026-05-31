/**
 * Phase 10 — Workspace Dashboard.
 *
 * Built ONLY from real endpoints:
 *  - useDocuments  (/documents)        → document count
 *  - useConversations (/rag/conversations) → conversation count + recent list
 *  - useJobs       (/ingestion/jobs)   → ingestion health + recent uploads
 *
 * Counts come from a fetched page (limit-capped) and are labelled honestly in
 * StatGrid; nothing here invents a backend total.
 */

import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useDocuments } from "@/features/documents/api";
import { useJobs } from "@/features/ingestion/api";
import { useConversations } from "@/features/rag/api";
import { StatGrid, DASHBOARD_PAGE_LIMIT } from "./components/StatGrid";
import { RecentConversations } from "./components/RecentConversations";
import { RecentJobs } from "./components/RecentJobs";
import { QuickActions } from "./components/QuickActions";

export function DashboardPage() {
  const documentsQuery = useDocuments({ limit: DASHBOARD_PAGE_LIMIT });
  const conversationsQuery = useConversations({ limit: DASHBOARD_PAGE_LIMIT });
  const jobsQuery = useJobs({ limit: DASHBOARD_PAGE_LIMIT });

  const statsLoading =
    documentsQuery.isLoading || conversationsQuery.isLoading || jobsQuery.isLoading;

  // A brand-new workspace: every source loaded successfully and is empty.
  const allLoaded =
    documentsQuery.isSuccess && conversationsQuery.isSuccess && jobsQuery.isSuccess;
  const isEmptyWorkspace =
    allLoaded &&
    (documentsQuery.data?.length ?? 0) === 0 &&
    (conversationsQuery.data?.length ?? 0) === 0 &&
    (jobsQuery.data?.length ?? 0) === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        icon={<LayoutDashboard aria-hidden="true" />}
        title="Çalışma alanı"
        description="Belgeleriniz, sohbetleriniz ve işleme durumunuza genel bakış."
      />

      <StatGrid
        documents={documentsQuery.data}
        conversations={conversationsQuery.data}
        jobs={jobsQuery.data}
        loading={statsLoading}
      />

      {isEmptyWorkspace ? (
        <EmptyState
          icon={<LayoutDashboard aria-hidden="true" />}
          title="Çalışma alanınız boş"
          description="Başlamak için bir belge yükleyin ya da yeni bir sohbet açın. Yüklediğiniz belgeler işlendikçe burada özetlenecek."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RecentConversations
            conversations={conversationsQuery.data}
            loading={conversationsQuery.isLoading}
            error={conversationsQuery.isError}
            onRetry={() => void conversationsQuery.refetch()}
          />
          <RecentJobs
            jobs={jobsQuery.data}
            loading={jobsQuery.isLoading}
            error={jobsQuery.isError}
            onRetry={() => void jobsQuery.refetch()}
          />
        </div>
      )}

      <QuickActions />
    </div>
  );
}
