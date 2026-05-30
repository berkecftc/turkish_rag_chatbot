import { useParams } from "react-router-dom";
import { Microscope } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export function RetrievalPage() {
  const { messageId } = useParams<{ messageId: string }>();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        icon={<Microscope aria-hidden="true" />}
        title="Getirim İncelemesi"
        description="Bir yanıtın getirim ve sıralama sürecini şeffaf biçimde inceleyin."
      />
      <EmptyState
        icon={<Microscope aria-hidden="true" />}
        title="Getirim şeffaflığı yakında"
        description={`Bu ekran Faz 9 aşamasında uygulanacak. Mesaj: ${messageId ?? "—"}`}
      />
    </div>
  );
}
