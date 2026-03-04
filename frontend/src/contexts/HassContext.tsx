import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/** Minimal typing for the Home Assistant object. */
export interface HassObject {
  states: Record<string, HassState>;
  callWS: <T = unknown>(msg: Record<string, unknown>) => Promise<T>;
  [key: string]: unknown;
}

export interface HassState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

interface HassContextValue {
  /** Get the current hass object (always the latest ref). */
  getHass: () => HassObject;
  /** Call a WebSocket command on HA. */
  callWS: <T = unknown>(msg: Record<string, unknown>) => Promise<T>;
  /** Subscribe to hass changes. Returns unsubscribe function. */
  subscribe: (cb: () => void) => () => void;
}

const HassContext = createContext<HassContextValue | null>(null);

interface HassProviderProps {
  hass: HassObject;
  children: ReactNode;
}

/**
 * Provides the HA `hass` object to the React tree.
 *
 * Uses a ref internally so we don't re-render the entire tree on every
 * hass update. Individual components subscribe to specific entities
 * via `useEntityState()` which uses `useSyncExternalStore`.
 */
export function HassProvider({ hass, children }: HassProviderProps) {
  const hassRef = useRef(hass);
  const listenersRef = useRef(new Set<() => void>());

  // Update ref and notify subscribers when hass changes
  if (hassRef.current !== hass) {
    hassRef.current = hass;
    for (const cb of listenersRef.current) {
      cb();
    }
  }

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  const getHass = useCallback(() => hassRef.current, []);

  const callWS = useCallback(
    <T = unknown,>(msg: Record<string, unknown>) =>
      hassRef.current.callWS<T>(msg),
    [],
  );

  const value = useMemo<HassContextValue>(
    () => ({ getHass, callWS, subscribe }),
    [getHass, callWS, subscribe],
  );

  return <HassContext.Provider value={value}>{children}</HassContext.Provider>;
}

/** Access the raw HassContext value. */
export function useHassContext(): HassContextValue {
  const ctx = useContext(HassContext);
  if (!ctx) throw new Error("useHassContext must be used within HassProvider");
  return ctx;
}
