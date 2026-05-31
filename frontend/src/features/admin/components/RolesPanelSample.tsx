import { Shield, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SampleNotice } from "./SampleNotice";
import { SAMPLE_ROLES } from "./sampleData";

/**
 * SAMPLE roles/permissions panel shell. RBAC in this app is permission-based
 * (perms[]); "roles" here are illustrative bundles of permissions. No endpoint
 * exists, so all data is sample and actions are disabled.
 */
export function RolesPanelSample() {
  return (
    <div className="space-y-4">
      <SampleNotice>
        Rol ve izin yönetimi için bir backend uç noktası bulunmamaktadır. Yetkilendirme izin tabanlıdır
        (perms[]); aşağıdaki roller örnek izin paketleridir.
      </SampleNotice>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLE_ROLES.map((role) => (
          <Card key={role.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Shield className="size-4" aria-hidden="true" />
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3.5" aria-hidden="true" />
                {role.memberCount} üye
              </span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">{role.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{role.description}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {role.perms.map((p) => (
                <Badge key={p} variant="muted" className="font-mono text-[10px]">
                  {p}
                </Badge>
              ))}
            </div>
            <div className="mt-4 flex gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" disabled title="Uç nokta bekleniyor">
                Düzenle
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
