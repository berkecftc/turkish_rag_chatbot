/** Ingestion outcomes — REAL data derived from /ingestion/jobs (donut). */

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { NamedValue } from "../api";
import { useChartColors } from "../useChartColors";
import { formatNumber } from "@/shared/lib/format";

export function IngestionDonut({ data }: { data: NamedValue[] }) {
  const colors = useChartColors();
  // Stable color per outcome: succeeded → success, failed → destructive, rest → muted series.
  const sliceColors = [colors.success, colors.destructive, colors.series[2]];
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
        Henüz işleme verisi yok
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          stroke="none"
        >
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={sliceColors[i % sliceColors.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 12,
            color: "hsl(var(--popover-foreground))",
          }}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 12, color: colors.muted }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
