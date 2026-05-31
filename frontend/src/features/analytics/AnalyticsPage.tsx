/**
 * Phase 11 — Analytics Dashboard.
 *
 * Data provenance is UNMISTAKABLE per chart (ChartCard renders a "Gerçek veri"
 * or "Örnek veri" badge):
 *  - REAL (derived from endpoints): ingestion outcomes, confidence
 *    distribution, token/cache summary.
 *  - SAMPLE (mock, no endpoint): token usage over time, latency trend,
 *    activity. The time-range selector only drives the SAMPLE series — a banner
 *    states this plainly.
 *
 * All chart colors resolve from the `--chart-*` design tokens via
 * `useChartColors` (light/dark safe). See `api.ts` for the swappable adapter.
 */

import { useState } from "react";
import { BarChart3, Info } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber, formatLatency } from "@/shared/lib/format";
import { useAnalytics, type AnalyticsRange } from "./api";
import { ChartCard } from "./components/ChartCard";
import { TokenUsageChart } from "./components/TokenUsageChart";
import { LatencyChart } from "./components/LatencyChart";
import { ActivityChart } from "./components/ActivityChart";
import { IngestionDonut } from "./components/IngestionDonut";
import { ConfidenceHistogram } from "./components/ConfidenceHistogram";
import { CacheHitGauge } from "./components/CacheHitGauge";

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: "7d", label: "7 gün" },
  { value: "30d", label: "30 gün" },
  { value: "90d", label: "90 gün" },
];

export function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const { data, isLoading, isError, refetch } = useAnalytics(range);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        icon={<BarChart3 aria-hidden="true" />}
        title="Analitik"
        description="Kullanım, gecikme ve getirim metriklerine genel bakış."
        actions={
          <Tabs
            value={range}
            onValueChange={(v) => setRange(v as AnalyticsRange)}
          >
            <TabsList aria-label="Zaman aralığı (yalnızca örnek veriler için)">
              {RANGE_OPTIONS.map((opt) => (
                <TabsTrigger key={opt.value} value={opt.value}>
                  {opt.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      {/* Honest banner: distinguishes real vs sample globally. */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-medium text-foreground">Gerçek veri</span> rozetli grafikler
          canlı API uç noktalarından türetilir.{" "}
          <span className="font-medium text-foreground">Örnek veri</span> rozetli grafikler ise
          henüz bir uç noktası bulunmadığından örnek (gerçek olmayan) değerlerle gösterilir;
          zaman aralığı seçici yalnızca bu örnek serileri etkiler.
        </p>
      </div>

      {isError ? (
        <ErrorState
          title="Analitik verileri yüklenemedi"
          description="Türetilmiş metrikler alınırken bir sorun oluştu."
          retryLabel="Yeniden dene"
          onRetry={refetch}
        />
      ) : (
        <AnalyticsGrid data={data} loading={isLoading} range={range} />
      )}
    </div>
  );
}

function AnalyticsGrid({
  data,
  loading,
  range,
}: {
  data: ReturnType<typeof useAnalytics>["data"];
  loading: boolean;
  range: AnalyticsRange;
}) {
  // When everything loaded and there's truly nothing real to show, surface an
  // empty state for the REAL section (sample charts still render below).
  const ingestionTotal =
    data?.ingestionSuccess.data.reduce((s, d) => s + d.value, 0) ?? 0;
  const confidenceTotal =
    data?.confidenceDistribution.data.reduce((s, d) => s + d.count, 0) ?? 0;
  const noReal = !loading && data != null && ingestionTotal === 0 && confidenceTotal === 0;

  return (
    <div className="space-y-6">
      {/* REAL section */}
      <section aria-label="Gerçek veriden türetilen metrikler">
        {noReal ? (
          <EmptyState
            icon={<BarChart3 aria-hidden="true" />}
            title="Henüz türetilecek gerçek veri yok"
            description="Belge yükleyip sohbet ettikçe işleme başarısı, güven dağılımı ve token kullanımı burada görünecek."
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ChartCard
              title="İşleme sonuçları"
              description="/ingestion/jobs uç noktasından"
              isSample={false}
              loading={loading}
              ariaLabel={
                data
                  ? `İşleme sonuçları: ${data.ingestionSuccess.data
                      .map((d) => `${d.name} ${d.value}`)
                      .join(", ")}`
                  : "İşleme sonuçları yükleniyor"
              }
              tableFallback={
                data && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-4">Durum</th>
                        <th className="py-1">İş sayısı</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ingestionSuccess.data.map((d) => (
                        <tr key={d.name}>
                          <td className="py-1 pr-4">{d.name}</td>
                          <td className="py-1 tabular-nums">{formatNumber(d.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            >
              {data && <IngestionDonut data={data.ingestionSuccess.data} />}
            </ChartCard>

            <ChartCard
              title="Güven dağılımı"
              description="Mesaj güven puanlarından"
              isSample={false}
              loading={loading}
              ariaLabel={
                data
                  ? `Güven puanı dağılımı: ${data.confidenceDistribution.data
                      .map((d) => `${d.bucket} ${d.count} mesaj`)
                      .join(", ")}`
                  : "Güven dağılımı yükleniyor"
              }
              tableFallback={
                data && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-4">Aralık</th>
                        <th className="py-1">Mesaj</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.confidenceDistribution.data.map((d) => (
                        <tr key={d.bucket}>
                          <td className="py-1 pr-4">{d.bucket}</td>
                          <td className="py-1 tabular-nums">{formatNumber(d.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            >
              {data && <ConfidenceHistogram data={data.confidenceDistribution.data} />}
            </ChartCard>

            <ChartCard
              title="Token / önbellek özeti"
              description="Mesaj token sayılarından"
              isSample={false}
              loading={loading}
              ariaLabel={
                data
                  ? `Toplam ${data.cacheHit.data.tokenTotal} token, ${data.cacheHit.data.sampled} mesajdan ölçüldü. Önbellek isabet oranı türetilemiyor.`
                  : "Token özeti yükleniyor"
              }
            >
              {data && (
                <CacheHitGauge
                  hitRate={data.cacheHit.data.hitRate}
                  sampled={data.cacheHit.data.sampled}
                  tokenTotal={data.cacheHit.data.tokenTotal}
                />
              )}
            </ChartCard>
          </div>
        )}
      </section>

      {/* SAMPLE section */}
      <section aria-label="Örnek (gerçek olmayan) metrikler">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ChartCard
            title="Token kullanımı"
            description={`Zaman içinde · son ${range === "7d" ? "7" : range === "30d" ? "30" : "90"} gün`}
            isSample
            loading={loading}
            ariaLabel="Örnek veri: zaman içinde token kullanımı eğilimi."
            tableFallback={
              data && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-4">Tarih</th>
                      <th className="py-1">Token</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tokenUsageOverTime.data.map((d) => (
                      <tr key={d.date}>
                        <td className="py-1 pr-4 tabular-nums">{d.date}</td>
                        <td className="py-1 tabular-nums">{formatNumber(d.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          >
            {data && <TokenUsageChart data={data.tokenUsageOverTime.data} />}
          </ChartCard>

          <ChartCard
            title="Getirim gecikmesi"
            description="Zaman içinde eğilim"
            isSample
            loading={loading}
            ariaLabel="Örnek veri: zaman içinde getirim gecikmesi eğilimi."
            tableFallback={
              data && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-4">Tarih</th>
                      <th className="py-1">Gecikme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.latencyTrend.data.map((d) => (
                      <tr key={d.date}>
                        <td className="py-1 pr-4 tabular-nums">{d.date}</td>
                        <td className="py-1 tabular-nums">{formatLatency(d.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          >
            {data && <LatencyChart data={data.latencyTrend.data} />}
          </ChartCard>

          <ChartCard
            title="Etkinlik"
            description="Zaman içinde günlük etkinlik"
            isSample
            loading={loading}
            ariaLabel="Örnek veri: zaman içinde günlük etkinlik."
            tableFallback={
              data && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-4">Tarih</th>
                      <th className="py-1">Etkinlik</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activityOverTime.data.map((d) => (
                      <tr key={d.date}>
                        <td className="py-1 pr-4 tabular-nums">{d.date}</td>
                        <td className="py-1 tabular-nums">{formatNumber(d.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          >
            {data && <ActivityChart data={data.activityOverTime.data} />}
          </ChartCard>
        </div>
      </section>
    </div>
  );
}
