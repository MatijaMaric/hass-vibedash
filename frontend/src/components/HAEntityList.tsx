import type { BaseComponentProps } from "@json-render/react";
import { useEntityState } from "../hooks/useHass";
import { useHistory } from "../hooks/useHistory";

interface HAEntityListProps {
  title: string;
  entities: string[];
  timeRange?: string;
}

function EntityRow({
  entityId,
  delta,
}: {
  entityId: string;
  delta?: number | null;
}) {
  const state = useEntityState(entityId);
  const name =
    (state?.attributes?.friendly_name as string) ?? entityId;
  const unit = (state?.attributes?.unit_of_measurement as string) ?? "";
  const value = delta != null ? formatDelta(delta) : state?.state ?? "—";

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 text-sm text-foreground">{name}</td>
      <td className="py-2 text-right text-sm font-medium text-foreground">
        {value}
        {unit && (
          <span className="ml-1 text-muted-foreground">{unit}</span>
        )}
      </td>
    </tr>
  );
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}`;
}

export function HAEntityList({
  props,
}: BaseComponentProps<HAEntityListProps>) {
  const { title, entities, timeRange } = props;
  const { data: historyData } = useHistory(
    timeRange ? entities : [],
    timeRange ?? "24h",
  );

  // Compute deltas from history if timeRange is set
  const deltas: Record<string, number | null> = {};
  if (timeRange && historyData && historyData.length > 1) {
    for (const entityId of entities) {
      const first = historyData.find(
        (p) => p[entityId] != null,
      )?.[entityId];
      const last = [...historyData]
        .reverse()
        .find((p) => p[entityId] != null)?.[entityId];
      if (
        typeof first === "number" &&
        typeof last === "number"
      ) {
        deltas[entityId] = last - first;
      }
    }
  }

  return (
    <div className="rounded-xl bg-card p-5">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">
        {title}
      </h3>
      <table className="w-full">
        <tbody>
          {entities.map((entityId) => (
            <EntityRow
              key={entityId}
              entityId={entityId}
              delta={timeRange ? (deltas[entityId] ?? null) : undefined}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
