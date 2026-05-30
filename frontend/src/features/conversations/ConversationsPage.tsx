import { MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export function ConversationsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        icon={<MessagesSquare aria-hidden="true" />}
        title="Konuşmalar"
        description="Geçmiş sohbet konuşmalarınız."
      />
      <EmptyState
        icon={<MessagesSquare aria-hidden="true" />}
        title="Konuşma geçmişi yakında"
        description="Bu ekran Faz 13 aşamasında uygulanacak. Yapı ve yönlendirme hazır."
      />
    </div>
  );
}
