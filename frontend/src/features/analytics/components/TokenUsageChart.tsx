/** Token usage over time — SAMPLE data (area chart). */

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimePoint } from "../api";
import { useChartColors } from "../useChartColors";
import { ChartTooltip, shortDay } from "./chartTheme";

export function TokenUsageChart({ data }: { data: TimePoint[] }) {
  const colors = useChartColors();
  const stroke = colors.series[0];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
          </linearGradient>
        </defs>
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
        />
        <Tooltip content={<ChartTooltip unit="token" />} cursor={{ stroke: colors.border }} />
        <Area
          type="monotone"
          dataKey="value"
          name="Token"
          stroke={stroke}
          strokeWidth={2}
          fill="url(#tokenFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
