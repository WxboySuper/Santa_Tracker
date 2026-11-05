import type { RouteNode } from "./locations";
import type { SantaPosition } from "./tracker-position";

export interface TrackerMapAdapter {
  mount(element: HTMLElement): Promise<void>;
  setRoute(nodes: RouteNode[]): void;
  setSantaPosition(position: SantaPosition): void;
  follow(): void;
  stopFollowing(): void;
  fitToRoute(): void;
  destroy(): void;
}

export type MapMode = "vector" | "raster" | "text";
export type MapEvent = "vectorFailed" | "rasterFailed" | "initFailed" | "showText" | "showMap";

export function mapModeReducer(mode: MapMode, event: MapEvent): MapMode {
  if (event === "showText") return "text";
  if (event === "showMap") return "vector";
  if (event === "initFailed") return "text";
  if (event === "vectorFailed" && mode === "vector") return "raster";
  if (event === "rasterFailed" && mode === "raster") return "text";
  return mode;
}
