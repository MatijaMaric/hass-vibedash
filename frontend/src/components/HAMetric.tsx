import type { BaseComponentProps } from "@json-render/react";
import { useEntityState } from "../hooks/useHass";

interface HAMetricProps {
  title: string;
  entity: string;
}

export function HAMetric({ props }: BaseComponentProps<HAMetricProps>) {
  const { title, entity } = props;
  const state = useEntityState(entity);

  const value = state?.state ?? "—";
  const unit = (state?.attributes?.unit_of_measurement as string) ?? "";
  const friendlyName = (state?.attributes?.friendly_name as string) ?? entity;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-1 text-sm font-medium text-muted-foreground">
        {title}
      </h3>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tracking-tight text-foreground">
          {value}
        </span>
        {unit && (
          <span className="text-lg text-muted-foreground">{unit}</span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{friendlyName}</p>
    </div>
  );
}
