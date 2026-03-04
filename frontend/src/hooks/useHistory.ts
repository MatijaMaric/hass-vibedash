import { useEffect, useState } from "react";
import { useCallWS } from "./useHass";

export interface HistoryPoint {
  time: string;
  [entityId: string]: string | number | null;
}

interface HistoryResult {
  history: Record<string, Array<{ t: string; y: number }>>;
}

/**
 * Fetch entity history from HA recorder via the vibedash/history WebSocket command.
 * Returns data formatted for Recharts (array of {time, entity1: val, entity2: val}).
 */
export function useHistory(
  entityIds: string[],
  timeRange: string = "24h",
) {
  const callWS = useCallWS();
  const [data, setData] = useState<HistoryPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = entityIds.join(",") + ":" + timeRange;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    callWS<HistoryResult>({
      type: "vibedash/history",
      entity_ids: entityIds,
      time_range: timeRange,
    })
      .then((result) => {
        if (cancelled) return;
        setData(transformHistory(result.history, entityIds));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to fetch history");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key, callWS]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error };
}

/**
 * Transform the HA history response into Recharts-friendly format.
 * Input:  { "sensor.temp": [{t: "...", y: 22}, ...], ... }
 * Output: [{ time: "...", "sensor.temp": 22, ... }, ...]
 */
function transformHistory(
  history: Record<string, Array<{ t: string; y: number }>>,
  entityIds: string[],
): HistoryPoint[] {
  // Collect all unique timestamps
  const timeMap = new Map<string, HistoryPoint>();

  for (const entityId of entityIds) {
    const points = history[entityId] ?? [];
    for (const point of points) {
      if (!timeMap.has(point.t)) {
        timeMap.set(point.t, { time: point.t });
      }
      timeMap.get(point.t)![entityId] = point.y;
    }
  }

  // Sort by time
  return Array.from(timeMap.values()).sort((a, b) =>
    a.time.localeCompare(b.time),
  );
}
