import type { BaseComponentProps } from "@json-render/react";
import { useEntityState } from "../hooks/useHass";

interface HAMetricProps {
  title: string;
  entity: string;
}

function formatValue(raw: string): string {
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  // Show up to 1 decimal for clean display
  return num % 1 === 0 ? num.toString() : num.toFixed(1);
}

export function HAMetric({ props }: BaseComponentProps<HAMetricProps>) {
  const { title, entity } = props;
  const state = useEntityState(entity);

  const rawValue = state?.state ?? "—";
  const value = rawValue === "—" ? rawValue : formatValue(rawValue);
  const unit = (state?.attributes?.unit_of_measurement as string) ?? "";

  return (
    <div className="rounded-xl bg-card p-5">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
        {title}
      </h3>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight text-foreground">
          {value}
        </span>
        {unit && (
          <span className="text-lg text-muted-foreground">{unit}</span>
        )}
      </div>
    </div>
  );
}
