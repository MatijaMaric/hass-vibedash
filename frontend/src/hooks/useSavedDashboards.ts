import { useCallback, useEffect, useState } from "react";
import { useCallWS } from "./useHass";

export interface SavedDashboard {
  id: string;
  name: string;
  prompt: string;
  dashboard: { root: string; elements: Record<string, unknown> };
  created_at: string;
  updated_at: string;
}

interface DashboardListResult {
  dashboards: SavedDashboard[];
}

interface DashboardSaveResult {
  saved: SavedDashboard;
}

export function useSavedDashboards() {
  const callWS = useCallWS();
  const [dashboards, setDashboards] = useState<SavedDashboard[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await callWS<DashboardListResult>({
        type: "vibedash/dashboard_list",
      });
      setDashboards(result.dashboards);
    } catch {
      // Silently handle — store may not be ready yet
      setDashboards([]);
    } finally {
      setLoading(false);
    }
  }, [callWS]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveDashboard = useCallback(
    async (
      name: string,
      prompt: string,
      dashboard: { root: string; elements: Record<string, unknown> },
    ): Promise<SavedDashboard> => {
      const result = await callWS<DashboardSaveResult>({
        type: "vibedash/dashboard_save",
        name,
        prompt,
        dashboard,
      });
      await refresh();
      return result.saved;
    },
    [callWS, refresh],
  );

  const deleteDashboard = useCallback(
    async (id: string) => {
      await callWS({ type: "vibedash/dashboard_delete", dashboard_id: id });
      await refresh();
    },
    [callWS, refresh],
  );

  return { dashboards, loading, saveDashboard, deleteDashboard, refresh };
}
