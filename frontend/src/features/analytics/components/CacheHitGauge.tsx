/**
 * Token usage summary — REAL data from message `token_count`.
 *
 * HONESTY: MessageOut does not carry a `cached` flag (only the non-stream
 * ChatResponse does, which we don't persist), so a true cache-hit RATE is NOT
 * derivable from the message list. Rather than fabricate one, this component
 * renders the real aggregate token total and a gauge of "ölçülen mesajlar"
 * (messages that reported a token_count) and clearly states when the cache-hit
 * rate is unavailable.
 */

import {
  RadialBar,
  RadialBarChart,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import { useChartColors } from "../useChartColors";
import { formatNumber, formatPercent } from "@/shared/lib/format";

export interface CacheHitGaugeProps {
  hitRate: number | null;
  sampled: number;
  tokenTotal: number;
}

export function CacheHitGauge({ hitRate, sampled, tokenTotal }: CacheHitGaugeProps) {
  const colors = useChartColors();
  // When no rate is derivable, the gauge visualizes a neutral 0 and the caption
  // explains why. When a rate IS available (future backend), it fills it in.
  const value = hitRate == null ? 0 : Math.round(hitRate * 100);
  const fill = hitRate == null ? colors.muted : colors.series[5];

  return (
    <div className="flex size-full flex-col items-center justify-center">
      <div className="relative h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={[{ name: "rate", value }]}
            startAngle={210}
            endAngle={-30}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={8} fill={fill} background />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {hitRate == null ? "—" : formatPercent(hitRate)}
          </span>
          <span className="text-[11px] text-muted-foreground">önbellek isabeti</span>
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-muted-foreground">
        {hitRate == null ? (
          <>
            Önbellek isabet oranı mesaj kayıtlarından türetilemiyor. Toplam{" "}
            <span className="font-medium text-foreground">{formatNumber(tokenTotal)}</span>{" "}
            token, {formatNumber(sampled)} mesajdan ölçüldü.
          </>
        ) : (
          <>
            {formatNumber(sampled)} mesaj örneklendi ·{" "}
            <span className="font-medium text-foreground">{formatNumber(tokenTotal)}</span>{" "}
            token
          </>
        )}
      </p>
    </div>
  );
}
