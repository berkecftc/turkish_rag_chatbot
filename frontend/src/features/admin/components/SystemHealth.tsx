import * as React from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Database,
  Server,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { RealBadge } from "@/features/analytics/components/SampleBadge";
import { formatNumber } from "@/shared/lib/format";
import {
  useHealth,
  useMetrics,
  highlightMetrics,
  type HealthCheckState,
} from "@/features/admin/api";

/** Map a raw check value to up/down semantics defensively. */
function isUp(state: HealthCheckState): boolean {
  const s = String(state).toLowerCase();
  return s === "up" || s === "ok" || s === "healthy" || s === "true" || s === "ready";
}

const CHECK_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  postgres: { label: "PostgreSQL", icon: Database },
  redis: { label: "Redis", icon: Server },
};

function ServiceRow({ name, state }: { name: string; state: HealthCheckState }) {
  const up = isUp(state);
  const meta = CHECK_META[name] ?? { label: name, icon: Server };
  const Icon = meta.icon;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-medium text-foreground">{meta.label}</span>
      </div>
      <Badge variant={up ? "success" : "destructive"}>
        {up ? (
          <CheckCircle2 className="size-3" aria-hidden="true" />
        ) : (
          <XCircle className="size-3" aria-hidden="true" />
        )}
        {up ? "Çalışıyor" : "Erişilemiyor"}
      </Badge>
    </div>
  );
}

function MetricsPanel() {
  const { data, isLoading, isError, refetch } = useMetrics();
  const [showRaw, setShowRaw] = React.useState(false);
  const highlights = React.useMemo(() => highlightMetrics(data), [data]);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">Sistem metrikleri</h3>
          <RealBadge />
        </div>
        <span className="text-xs text-muted-foreground">/metrics (Prometheus)</span>
      </div>

      {isLoading && <LoadingState className="py-8" srLabel="Metrikler yükleniyor" />}

      {isError && !isLoading && (
        <div className="mt-4">
          <ErrorState
            className="py-8"
            title="Metrikler alınamadı"
            description="Prometheus metrik uç noktasına ulaşılamadı."
            retryLabel="Tekrar dene"
            onRetry={() => void refetch()}
          />
        </div>
      )}

      {data && !isLoading && !isError && (
        <>
          {highlights.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {highlights.map((h) => (
                <li
                  key={h.name}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
                >
                  <code className="truncate font-mono text-xs text-muted-foreground">{h.name}</code>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                    {formatNumber(h.total, { maximumFractionDigits: 2 })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Öne çıkarılacak HTTP / işlem metriği bulunamadı. Ham çıktıyı aşağıdan inceleyebilirsiniz.
            </p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Toplam {formatNumber(data.totalSamples)} metrik örneği.
          </p>

          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            aria-expanded={showRaw}
            className="mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", showRaw && "rotate-180")}
              aria-hidden="true"
            />
            Ham metrikleri {showRaw ? "gizle" : "göster"}
          </button>

          {showRaw && (
            <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {data.raw}
            </pre>
          )}
        </>
      )}
    </Card>
  );
}

/** REAL system health — readiness (/health/ready) + Prometheus metrics (/metrics). */
export function SystemHealth() {
  const { data, isLoading, isError, refetch, isFetching } = useHealth();

  const checks = data?.checks ?? {};
  const checkEntries = Object.entries(checks);
  const overallUp = data ? String(data.status).toLowerCase() === "ok" || String(data.status).toLowerCase() === "ready" || String(data.status).toLowerCase() === "healthy" : false;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-foreground">Servis durumu</h3>
            <RealBadge />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            aria-label="Durumu yenile"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} aria-hidden="true" />
            Yenile
          </Button>
        </div>

        {isLoading && <LoadingState className="py-8" srLabel="Sistem durumu yükleniyor" />}

        {isError && !isLoading && (
          <div className="mt-4">
            <ErrorState
              className="py-8"
              title="Sağlık durumu alınamadı"
              description="Hazırlık (readiness) uç noktasına ulaşılamadı. Servis kapalı olabilir."
              retryLabel="Tekrar dene"
              onRetry={() => void refetch()}
            />
          </div>
        )}

        {data && !isLoading && !isError && (
          <>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Genel durum:</span>
              <Badge variant={overallUp ? "success" : "warning"}>{data.status}</Badge>
            </div>

            {checkEntries.length > 0 ? (
              <div className="mt-4 space-y-2">
                {checkEntries.map(([name, state]) => (
                  <ServiceRow key={name} name={name} state={state} />
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Bağımlılık kontrolü bildirilmedi.
              </p>
            )}
          </>
        )}
      </Card>

      <MetricsPanel />
    </div>
  );
}
