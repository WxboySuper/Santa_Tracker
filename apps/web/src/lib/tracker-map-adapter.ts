import type { RouteNode } from "./locations";
import type { SantaPosition } from "./tracker-position";

export interface TrackerMapAdapter {
  mount(element: HTMLElement): Promise<void>;
  setRoute(nodes: RouteNode[]): void;
  setSantaPosition(position: SantaPosition): void;
  follow(): void;
  visitPole(): void;
  stopFollowing(): void;
  fitToRoute(): void;
  destroy(): void;
}

export type MapMode = "vector" | "raster" | "text";
export type MapEvent = "vectorFailed" | "rasterFailed" | "initFailed" | "showText" | "showMap" | "showRaster";
const MAP_INTERACTION_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "-", "PageUp", "PageDown"];

export function isMapInteractionKey(key: string): boolean {
  return MAP_INTERACTION_KEYS.includes(key);
}

export function syncMapState(adapter: TrackerMapAdapter | undefined, nodes: RouteNode[], position: SantaPosition | null): void {
  if (!adapter) return;
  adapter.setRoute(nodes);
  if (position) adapter.setSantaPosition(position);
}

type ModeTransition = (mode: MapMode) => MapMode;
const modeTransitions: Record<MapEvent, ModeTransition> = {
  showText: () => "text",
  showMap: () => "vector",
  showRaster: () => "raster",
  initFailed: () => "text",
  vectorFailed: mode => transitionAfterVectorFailure(mode),
  rasterFailed: mode => transitionAfterRasterFailure(mode),
};

export function mapModeReducer(mode: MapMode, event: MapEvent): MapMode {
  return modeTransitions[event](mode);
}

function transitionAfterVectorFailure(mode: MapMode): MapMode {
  return mode === "vector" ? "raster" : mode;
}

function transitionAfterRasterFailure(mode: MapMode): MapMode {
  return mode === "raster" ? "text" : mode;
}
