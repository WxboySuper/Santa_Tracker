import { useEffect, useRef } from "react";
import { startAdapter } from "./tracker-map-start";
import type { MapRuntime } from "./tracker-map-types";
import type { MapEvent, MapMode } from "@/lib/tracker-map-adapter";
import type { TrackerMapAdapter } from "@/lib/tracker-map-adapter";

export type { MapEvent, MapMode };

function interactiveMode(mode: MapMode): Exclude<MapMode, "text"> | null {
  if (mode === "text") return null;
  return mode;
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
    const start = async () => {
      const startOptions = { mode: mapMode, element, nodes: latestNodes.current, position: latestPosition.current, dispatch, stopFollowing, adapter };
      const result = await startAdapter(startOptions, () => cancelled);
      instance = result.instance;
      if (cancelled) return;
      if (result.failure) dispatch(result.failure);
    };
    void start();
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
