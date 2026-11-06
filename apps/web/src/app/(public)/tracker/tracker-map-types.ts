import type { Dispatch, RefObject } from "react";
import type { RouteNode } from "@/lib/locations";
import type { SantaPosition } from "@/lib/tracker-position";
import type { MapEvent, MapMode, TrackerMapAdapter } from "@/lib/tracker-map-adapter";

export type InteractiveMapMode = Exclude<MapMode, "text">;

export interface MapRuntime {
  mode: MapMode;
  element: RefObject<HTMLDivElement | null>;
  nodes: RouteNode[];
  position: SantaPosition | null;
  dispatch: Dispatch<MapEvent>;
  stopFollowing: () => void;
  adapter: RefObject<TrackerMapAdapter | null>;
}

export interface StartResult {
  instance?: TrackerMapAdapter;
  failure?: MapEvent;
}
