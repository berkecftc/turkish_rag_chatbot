/** Confidence distribution — REAL data bucketed from message confidence_score. */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ConfidenceBucket } from "../api";
import { useChartColors } from "../useChartColors";
import { formatNumber } from "@/shared/lib/format";

export function ConfidenceHistogram({ data }: { data: ConfidenceBucket[] }) {
  const colors = useChartColors();
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex size-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Henüz güven puanı içeren mesaj yok
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="bucket"
          tick={{ fill: colors.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: colors.border }}
        />
        <YAxis
          tick={{ fill: colors.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={36}
          allowDecimals={false}
        />
        <Tooltip
          formatter={(value) => [formatNumber(Number(value)), "Mesaj"]}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 12,
            color: "hsl(var(--popover-foreground))",
          }}
          cursor={{ fill: colors.grid, fillOpacity: 0.3 }}
        />
        <Bar dataKey="count" name="Mesaj" fill={colors.series[1]} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
