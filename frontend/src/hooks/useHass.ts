import { useCallback, useSyncExternalStore } from "react";
import { useHassContext, type HassObject, type HassState } from "../contexts/HassContext";

/** Get the full hass object (re-renders on every hass change — use sparingly). */
export function useHass(): HassObject {
  const { getHass, subscribe } = useHassContext();
  return useSyncExternalStore(subscribe, getHass);
}

/** Subscribe to a single entity's state. Only re-renders when that entity changes. */
export function useEntityState(entityId: string): HassState | undefined {
  const { getHass, subscribe } = useHassContext();

  const getSnapshot = useCallback(
    () => getHass().states[entityId],
    [getHass, entityId],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Call a WebSocket command (stable ref, never causes re-render). */
export function useCallWS() {
  const { callWS } = useHassContext();
  return callWS;
}
