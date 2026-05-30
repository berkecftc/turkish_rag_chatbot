import { useNavigate } from "react-router-dom";
import { Compass } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        icon={<Compass aria-hidden="true" />}
        title="Sayfa bulunamadı"
        description="Aradığınız sayfa taşınmış veya hiç var olmamış olabilir."
      />
      <EmptyState
        icon={<Compass aria-hidden="true" />}
        title="404"
        description="Bu adreste bir içerik yok."
        action={
          <Button size="sm" onClick={() => navigate("/")}>
            Panele dön
          </Button>
        }
      />
    </div>
  );
}
