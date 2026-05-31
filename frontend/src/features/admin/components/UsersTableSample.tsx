import { UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatRelativeTime } from "@/shared/lib/format";
import { SampleNotice } from "./SampleNotice";
import { SAMPLE_USERS, type SampleUser } from "./sampleData";

const STATUS_LABEL: Record<SampleUser["status"], { label: string; variant: "success" | "info" | "destructive" }> = {
  active: { label: "Aktif", variant: "success" },
  invited: { label: "Davetli", variant: "info" },
  suspended: { label: "Askıda", variant: "destructive" },
};

/**
 * SAMPLE users table shell. No user-management endpoint exists, so the rows are
 * static sample data and all actions are disabled. Production-quality markup so
 * it becomes a drop-in once `/users` ships.
 */
export function UsersTableSample() {
  return (
    <div className="space-y-4">
      <SampleNotice>
        Kullanıcı yönetimi için bir backend uç noktası bulunmamaktadır. Aşağıdaki tablo örnek
        verilerle gösterilmektedir; eylemler devre dışıdır.
      </SampleNotice>

      <Card>
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">Kullanıcılar</h3>
          <Button size="sm" disabled title="Uç nokta bekleniyor">
            <UserPlus className="size-4" aria-hidden="true" />
            Kullanıcı davet et
          </Button>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <caption className="sr-only">Örnek kullanıcı listesi</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-5 py-2.5 font-medium">Kullanıcı</th>
                <th scope="col" className="px-5 py-2.5 font-medium">İzinler</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Durum</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Son etkinlik</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_USERS.map((u) => (
                <tr key={u.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar fallback={u.displayName.slice(0, 1)} className="size-8" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{u.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.perms.slice(0, 3).map((p) => (
                        <Badge key={p} variant="muted" className="font-mono text-[10px]">
                          {p}
                        </Badge>
                      ))}
                      {u.perms.length > 3 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{u.perms.length - 3}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={STATUS_LABEL[u.status].variant}>
                      {STATUS_LABEL[u.status].label}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {formatRelativeTime(u.lastActiveAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="divide-y divide-border md:hidden">
          {SAMPLE_USERS.map((u) => (
            <li key={u.id} className="space-y-2 px-5 py-3">
              <div className="flex items-center gap-3">
                <Avatar fallback={u.displayName.slice(0, 1)} className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{u.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <Badge variant={STATUS_LABEL[u.status].variant}>
                  {STATUS_LABEL[u.status].label}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {u.perms.map((p) => (
                  <Badge key={p} variant="muted" className="font-mono text-[10px]">
                    {p}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Son etkinlik: {formatRelativeTime(u.lastActiveAt)}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
