import { useParams } from "react-router-dom";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        icon={<FileText aria-hidden="true" />}
        title="Belge Ayrıntısı"
        description="Belge meta verileri, sürümleri ve parçaları."
      />
      <EmptyState
        icon={<FileText aria-hidden="true" />}
        title="Belge ayrıntısı yakında"
        description={`Bu ekran Faz 7 aşamasında uygulanacak. Belge: ${id ?? "—"}`}
      />
    </div>
  );
}
