import { useEffect, useRef } from "react";
import { startAdapter } from "./tracker-map-start";
import type { MapRuntime } from "./tracker-map-types";
import { syncMapState, type MapEvent, type MapMode, type TrackerMapAdapter } from "@/lib/tracker-map-adapter";

export type { MapEvent, MapMode };

function interactiveMode(mode: MapMode): Exclude<MapMode, "text"> | null {
  if (mode === "text") return null;
  return mode;
}

async function attachMap(
  runtime: Omit<MapRuntime, "mode"> & { mode: Exclude<MapMode, "text"> },
  cancelled: () => boolean,
  setInstance: (adapter?: TrackerMapAdapter) => void,
  latestState: () => { nodes: MapRuntime["nodes"]; position: MapRuntime["position"] },
): Promise<void> {
  const result = await startAdapter(runtime, cancelled);
  setInstance(result.instance);
  if (cancelled()) {
    result.instance?.destroy();
    return;
  }
  const current = latestState();
  syncMapState(result.instance, current.nodes, current.position);
  if (result.failure) runtime.dispatch(result.failure);
}

export function useMapAdapter(runtime: MapRuntime): void {
  const { mode, element, nodes, position, dispatch, stopFollowing, adapter } = runtime;
  const latestNodes = useRef(nodes);
  const latestPosition = useRef(position);
  latestNodes.current = nodes;
  latestPosition.current = position;

  useEffect(() => {
    const mapMode = interactiveMode(mode);
    if (mapMode === null) return;
    let cancelled = false;
    let instance: TrackerMapAdapter | undefined;
    const startOptions = { mode: mapMode, element, nodes: latestNodes.current, position: latestPosition.current, dispatch, stopFollowing, adapter };
    void attachMap(startOptions, () => cancelled, value => { instance = value; }, () => ({ nodes: latestNodes.current, position: latestPosition.current }));
    return () => {
      cancelled = true;
      instance?.destroy();
      adapter.current = null;
    };
  }, [mode, element, dispatch, stopFollowing, adapter]);
  useEffect(() => { adapter.current?.setRoute(nodes); }, [nodes, adapter]);
  useEffect(() => {
    if (position) adapter.current?.setSantaPosition(position);
  }, [position, adapter]);
}
