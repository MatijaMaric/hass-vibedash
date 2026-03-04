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
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useHistory } from "../hooks/useHistory";
import { useEntityState } from "../hooks/useHass";

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

function EntityName({ entityId }: { entityId: string }) {
  const state = useEntityState(entityId);
  return (
    <>{(state?.attributes?.friendly_name as string) ?? entityId}</>
  );
}

function formatTime(time: string): string {
  const d = new Date(time);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function HAChart({ props }: BaseComponentProps<HAChartProps>) {
  const { title, chartType, entities, timeRange } = props;
  const { data, loading, error } = useHistory(entities, timeRange);

  // Build friendly name map by reading entity states
  const nameMap: Record<string, string> = {};
  for (const eid of entities) {
    nameMap[eid] = eid; // fallback; actual names resolved in tooltip/legend
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
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
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                opacity={0.3}
              />
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                stroke="var(--color-border)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                stroke="var(--color-border)"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-foreground)",
                }}
                labelFormatter={formatTime}
              />
              {entities.length > 1 && <Legend />}
              {entities.map((entityId, i) => (
                <Bar
                  key={entityId}
                  dataKey={entityId}
                  name={entityId}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          ) : chartType === "area" ? (
            <AreaChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                opacity={0.3}
              />
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                stroke="var(--color-border)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                stroke="var(--color-border)"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
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
                  name={entityId}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  fillOpacity={0.15}
                />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                opacity={0.3}
              />
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                stroke="var(--color-border)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                stroke="var(--color-border)"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
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
                  name={entityId}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  dot={data.length <= 80}
                  strokeWidth={2}
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
