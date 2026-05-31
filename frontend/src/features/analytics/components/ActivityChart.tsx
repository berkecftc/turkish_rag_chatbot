/** Activity over time — SAMPLE data (bar chart). */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimePoint } from "../api";
import { useChartColors } from "../useChartColors";
import { ChartTooltip, shortDay } from "./chartTheme";

export function ActivityChart({ data }: { data: TimePoint[] }) {
  const colors = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
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
          width={36}
          allowDecimals={false}
        />
        <Tooltip
          content={<ChartTooltip unit="etkinlik" />}
          cursor={{ fill: colors.grid, fillOpacity: 0.3 }}
        />
        <Bar dataKey="value" name="Etkinlik" fill={colors.series[3]} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
