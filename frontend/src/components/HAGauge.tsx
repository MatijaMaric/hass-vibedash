import type { BaseComponentProps } from "@json-render/react";
import { useEntityState } from "../hooks/useHass";

interface HAGaugeProps {
  title: string;
  entity: string;
  min: number;
  max: number;
}

export function HAGauge({ props }: BaseComponentProps<HAGaugeProps>) {
  const { title, entity, min, max } = props;
  const state = useEntityState(entity);

  const numValue = parseFloat(state?.state ?? "0");
  const value = isNaN(numValue) ? 0 : numValue;
  const unit = (state?.attributes?.unit_of_measurement as string) ?? "";
  const friendlyName = (state?.attributes?.friendly_name as string) ?? entity;

  const range = max - min;
  const pct = range > 0 ? Math.max(0, Math.min(1, (value - min) / range)) : 0;

  // Semicircle arc: 180 degrees, r=70, center at (85, 80)
  const r = 70;
  const cx = 85;
  const cy = 80;
  const startAngle = Math.PI;
  const endAngle = startAngle - pct * Math.PI;

  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy - r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy - r * Math.sin(endAngle);
  const largeArc = pct > 0.5 ? 1 : 0;

  // Color based on percentage
  const color =
    pct < 0.6
      ? "var(--color-success)"
      : pct < 0.8
        ? "var(--color-warning)"
        : "var(--color-destructive)";

  return (
    <div className="rounded-xl bg-card p-4">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 170 100" className="w-full max-w-[170px]">
          {/* Background arc */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Value arc */}
          {pct > 0 && (
            <path
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeLinecap="round"
            />
          )}
          {/* Center text */}
          <text
            x={cx}
            y={cy - 5}
            textAnchor="middle"
            className="fill-foreground text-2xl font-bold"
            style={{ fontSize: "24px" }}
          >
            {state?.state ?? "—"}
          </text>
          {unit && (
            <text
              x={cx}
              y={cy + 12}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: "11px" }}
            >
              {unit}
            </text>
          )}
        </svg>
        <p className="mt-1 text-xs text-muted-foreground">{friendlyName}</p>
      </div>
    </div>
  );
}
