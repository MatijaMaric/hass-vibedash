import type { BaseComponentProps } from "@json-render/react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useHistory } from "../hooks/useHistory";
import { useHass } from "../hooks/useHass";

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
];

interface HAChartProps {
  title: string;
  chartType: "line" | "bar" | "area";
  entities: string[];
  timeRange: string;
}

function formatTime(time: string): string {
  const d = new Date(time);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function HAChart({ props }: BaseComponentProps<HAChartProps>) {
  const { title, chartType, entities, timeRange } = props;
  const { data, loading, error } = useHistory(entities, timeRange);

  // Build friendly name map from HA entity states
  const hass = useHass();
  const nameMap: Record<string, string> = {};
  for (const eid of entities) {
    nameMap[eid] =
      (hass.states[eid]?.attributes?.friendly_name as string) ?? eid;
  }

  return (
    <div className="rounded-xl bg-card p-6">
      <h3 className="mb-3 text-sm font-medium text-foreground">{title}</h3>

      {loading && (
        <div className="flex h-[220px] items-center justify-center text-muted-foreground">
          <div className="animate-pulse">Loading chart data...</div>
        </div>
      )}

      {error && (
        <div className="flex h-[220px] items-center justify-center text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && data && data.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          {chartType === "bar" ? (
            <BarChart data={data}>
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                stroke="none"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                stroke="none"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-foreground)",
                }}
                labelFormatter={formatTime}
              />
              {entities.length > 1 && <Legend />}
              {entities.map((entityId, i) => (
                <Bar
                  key={entityId}
                  dataKey={entityId}
                  name={nameMap[entityId]}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          ) : chartType === "area" ? (
            <AreaChart data={data}>
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                stroke="none"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                stroke="none"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-foreground)",
                }}
                labelFormatter={formatTime}
              />
              {entities.length > 1 && <Legend />}
              {entities.map((entityId, i) => (
                <Area
                  key={entityId}
                  type="monotone"
                  dataKey={entityId}
                  name={nameMap[entityId]}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  fillOpacity={0.15}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={data}>
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                stroke="none"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                stroke="none"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-foreground)",
                }}
                labelFormatter={formatTime}
              />
              {entities.length > 1 && <Legend />}
              {entities.map((entityId, i) => (
                <Line
                  key={entityId}
                  type="monotone"
                  dataKey={entityId}
                  name={nameMap[entityId]}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      )}

      {!loading && !error && (!data || data.length === 0) && (
        <div className="flex h-[220px] items-center justify-center text-muted-foreground">
          No history data available
        </div>
      )}
    </div>
  );
}
