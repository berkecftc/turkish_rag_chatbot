import { Shield } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SystemHealth } from "./components/SystemHealth";
import { IngestionMonitor } from "./components/IngestionMonitor";
import { UsersTableSample } from "./components/UsersTableSample";
import { RolesPanelSample } from "./components/RolesPanelSample";
import { AuditLogSample } from "./components/AuditLogSample";

/**
 * Admin panel (Phase 12). Route is permission-gated (`admin:read`) by the
 * router's RequirePermission wrapper.
 *
 * REAL sections: System Health (/health/ready + /metrics) and Ingestion
 * Monitoring (/ingestion/jobs).
 * SAMPLE sections: Users / Roles / Audit — no backend endpoints; every shell is
 * clearly labelled with a SampleBadge + info notice.
 */
export function AdminPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon={<Shield aria-hidden="true" />}
        title="Yönetim Paneli"
        description="Sistem sağlığı, yükleme izleme ve kullanıcı/rol yönetimi."
      />

      <Tabs defaultValue="health">
        <TabsList className="flex-wrap">
          <TabsTrigger value="health">Sistem sağlığı</TabsTrigger>
          <TabsTrigger value="ingestion">Yükleme izleme</TabsTrigger>
          <TabsTrigger value="users">Kullanıcılar</TabsTrigger>
          <TabsTrigger value="roles">Roller</TabsTrigger>
          <TabsTrigger value="audit">Denetim</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4">
          <SystemHealth />
        </TabsContent>
        <TabsContent value="ingestion" className="mt-4">
          <IngestionMonitor />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTableSample />
        </TabsContent>
        <TabsContent value="roles" className="mt-4">
          <RolesPanelSample />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditLogSample />
        </TabsContent>
      </Tabs>
    </div>
  );
}
