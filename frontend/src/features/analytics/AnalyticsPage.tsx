import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        icon={<BarChart3 aria-hidden="true" />}
        title="Analitik"
        description="Kullanım, gecikme ve getirim metriklerine genel bakış."
      />
      <EmptyState
        icon={<BarChart3 aria-hidden="true" />}
        title="Analitik panosu yakında"
        description="Bu ekran Faz 11 aşamasında uygulanacak. Yapı ve yönlendirme hazır."
      />
    </div>
  );
}
