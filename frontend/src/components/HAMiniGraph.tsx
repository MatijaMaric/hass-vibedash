import type { BaseComponentProps } from "@json-render/react";
import { useEntityState } from "../hooks/useHass";
import { useHistory } from "../hooks/useHistory";

interface HAMiniGraphProps {
  title: string;
  entity: string;
  timeRange?: string;
}

/**
 * Compact card showing current value + small sparkline.
 * Matches the mini-graph-card pattern common in HA dashboards.
 */
export function HAMiniGraph({ props }: BaseComponentProps<HAMiniGraphProps>) {
  const { title, entity, timeRange = "24h" } = props;
  const state = useEntityState(entity);
  const { data, loading } = useHistory([entity], timeRange);

  const value = state?.state ?? "—";
  const unit = (state?.attributes?.unit_of_measurement as string) ?? "";

  // Extract sparkline points from history data
  const points: number[] = [];
  if (data) {
    for (const point of data) {
      const v = point[entity];
      if (typeof v === "number") {
        points.push(v);
      }
    }
  }

  return (
    <div className="rounded-xl bg-card p-6">
      <h3 className="mb-1 text-sm font-medium text-muted-foreground">
        {title}
      </h3>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight text-foreground">
          {value}
        </span>
        {unit && (
          <span className="text-base text-muted-foreground">{unit}</span>
        )}
      </div>
      <div className="mt-2 h-[60px]">
        {loading ? (
          <div className="flex h-full items-center text-xs text-muted-foreground">
            <div className="animate-pulse">Loading...</div>
          </div>
        ) : points.length > 1 ? (
          <Sparkline points={points} />
        ) : (
          <div className="flex h-full items-center text-xs text-muted-foreground">
            No history data
          </div>
        )}
      </div>
    </div>
  );
}

/** Minimal SVG sparkline — no axes, no labels, just the line + fill. */
function Sparkline({ points }: { points: number[] }) {
  const width = 300;
  const height = 60;
  const padding = 1;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points.map((v, i) => {
    const x = padding + (i / (points.length - 1)) * (width - 2 * padding);
    const y =
      padding + (1 - (v - min) / range) * (height - 2 * padding);
    return { x, y };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
    .join(" ");

  // Closed path for area fill
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-full w-full"
    >
      <path
        d={areaPath}
        fill="var(--color-chart-1)"
        fillOpacity={0.15}
      />
      <path
        d={linePath}
        fill="none"
        stroke="var(--color-chart-1)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
