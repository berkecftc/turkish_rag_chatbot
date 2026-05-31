import { ScrollText, CheckCircle2, Ban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatRelativeTime } from "@/shared/lib/format";
import { SampleNotice } from "./SampleNotice";
import { SAMPLE_AUDIT } from "./sampleData";

/**
 * SAMPLE audit log shell. No audit endpoint exists; entries are static sample
 * data shown only to demonstrate the intended layout.
 */
export function AuditLogSample() {
  return (
    <div className="space-y-4">
      <SampleNotice>
        Denetim kaydı için bir backend uç noktası bulunmamaktadır. Aşağıdaki kayıtlar örnek verilerdir.
      </SampleNotice>

      <Card>
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <ScrollText className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">Denetim kaydı</h3>
        </div>
        <ul className="divide-y divide-border">
          {SAMPLE_AUDIT.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
              <span
                className={
                  entry.outcome === "success"
                    ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"
                    : "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                }
              >
                {entry.outcome === "success" ? (
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                ) : (
                  <Ban className="size-3.5" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{entry.actor}</span> — {entry.action}{" "}
                  <code className="font-mono text-xs text-muted-foreground">{entry.target}</code>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <time dateTime={entry.at} title={formatDateTime(entry.at)}>
                    {formatRelativeTime(entry.at)}
                  </time>
                </p>
              </div>
              <Badge variant={entry.outcome === "success" ? "success" : "destructive"}>
                {entry.outcome === "success" ? "Başarılı" : "Reddedildi"}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
