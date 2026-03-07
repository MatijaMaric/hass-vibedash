import { useEffect, useState } from "react";
import { useCallWS } from "./useHass";

export interface HistoryPoint {
  time: string;
  [entityId: string]: string | number | null;
}

interface HistoryResult {
  history: Record<string, Array<{ t: string; y: number }>>;
}

/** Bucket intervals in milliseconds, keyed by time range. */
const BUCKET_INTERVALS: Record<string, number> = {
  "1h": 1 * 60 * 1000, // 1 min  → 60 buckets
  "6h": 5 * 60 * 1000, // 5 min  → 72 buckets
  "24h": 10 * 60 * 1000, // 10 min → 144 buckets
  "7d": 60 * 60 * 1000, // 1 hr   → 168 buckets
  "30d": 4 * 60 * 60 * 1000, // 4 hr   → 180 buckets
};

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
        const transformed = transformHistory(result.history, entityIds);
        setData(resampleHistory(transformed, entityIds, timeRange));
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
 *
 * Each entity's last known value is forward-filled to all subsequent
 * timestamps so Recharts renders contiguous lines instead of gaps.
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
  const sorted = Array.from(timeMap.values()).sort((a, b) =>
    a.time.localeCompare(b.time),
  );

  // Forward-fill: carry each entity's last known value forward so that
  // timestamps where it didn't change still have a value (HA only records
  // state changes, so the last state persists until the next change).
  const lastKnown: Record<string, number | null> = {};
  for (const entityId of entityIds) {
    lastKnown[entityId] = null;
  }
  for (const point of sorted) {
    for (const entityId of entityIds) {
      const val = point[entityId];
      if (val !== undefined && val !== null) {
        lastKnown[entityId] = val as number;
      } else if (lastKnown[entityId] !== null) {
        point[entityId] = lastKnown[entityId];
      }
    }
  }

  return sorted;
}

/**
 * Resample irregularly-spaced history data into evenly-spaced time buckets.
 * Uses last-known-value (step) interpolation, matching HA sensor semantics
 * where a value persists until the next state change.
 */
function resampleHistory(
  sorted: HistoryPoint[],
  entityIds: string[],
  timeRange: string,
): HistoryPoint[] {
  if (sorted.length < 2) return sorted;

  const interval = BUCKET_INTERVALS[timeRange];
  if (!interval) return sorted;

  const startMs = new Date(sorted[0].time).getTime();
  const endMs = new Date(sorted[sorted.length - 1].time).getTime();

  if (endMs - startMs < interval) return sorted;

  // Build evenly-spaced bucket timestamps
  const buckets: HistoryPoint[] = [];
  for (let t = startMs; t <= endMs; t += interval) {
    buckets.push({ time: new Date(t).toISOString() });
  }
  // Include final point if it's more than half a bucket past the last regular bucket
  const lastBucketMs = new Date(buckets[buckets.length - 1].time).getTime();
  if (endMs - lastBucketMs > interval * 0.5) {
    buckets.push({ time: new Date(endMs).toISOString() });
  }

  // Fill buckets using last-known-value via single-pass scan
  let srcIdx = 0;
  const lastKnown: Record<string, number | null> = {};
  for (const eid of entityIds) {
    lastKnown[eid] = null;
  }

  for (const bucket of buckets) {
    const bucketMs = new Date(bucket.time).getTime();

    // Advance source pointer to the last point at or before this bucket
    while (
      srcIdx < sorted.length - 1 &&
      new Date(sorted[srcIdx + 1].time).getTime() <= bucketMs
    ) {
      for (const eid of entityIds) {
        const v = sorted[srcIdx][eid];
        if (v !== undefined && v !== null) {
          lastKnown[eid] = v as number;
        }
      }
      srcIdx++;
    }

    // Check current source point
    if (new Date(sorted[srcIdx].time).getTime() <= bucketMs) {
      for (const eid of entityIds) {
        const v = sorted[srcIdx][eid];
        if (v !== undefined && v !== null) {
          lastKnown[eid] = v as number;
        }
      }
    }

    // Assign last known values to this bucket
    for (const eid of entityIds) {
      if (lastKnown[eid] !== null) {
        bucket[eid] = lastKnown[eid];
      }
    }
  }

  return buckets;
}
