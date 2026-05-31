/** Retrieval latency trend — SAMPLE data (line chart). */

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimePoint } from "../api";
import { useChartColors } from "../useChartColors";
import { ChartTooltip, shortDay } from "./chartTheme";

export function LatencyChart({ data }: { data: TimePoint[] }) {
  const colors = useChartColors();
  const stroke = colors.series[5];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDay}
          tick={{ fill: colors.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: colors.border }}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: colors.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={48}
          unit=" ms"
        />
        <Tooltip content={<ChartTooltip unit="ms" />} cursor={{ stroke: colors.border }} />
        <Line
          type="monotone"
          dataKey="value"
          name="Gecikme"
          stroke={stroke}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
