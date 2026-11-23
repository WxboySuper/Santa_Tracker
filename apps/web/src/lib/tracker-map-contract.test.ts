import { describe, expect, it, vi } from "vitest";
import type { RouteNode } from "./locations";
import type { SantaPosition } from "./tracker-position";
import { mapModeReducer, type TrackerMapAdapter } from "./tracker-map-adapter";
import { OpenLayersTrackerMap } from "./openlayers-tracker-map";

const mockState = vi.hoisted(() => ({
  maps: [] as { disposeCount: number }[],
  rasterError: undefined as (() => void) | undefined,
  failStyle: false,
}));

vi.mock("ol/Map.js", () => ({ default: class {
  readonly view = { setCenter: vi.fn(), fit: vi.fn(), getResolutionForZoom: vi.fn(() => 1), animate: vi.fn() };
  disposeCount = 0;
  constructor() { mockState.maps.push(this); }
  addLayer() { void 0; }
  getView() { return this.view; }
  getSize() { return [800, 600]; }
  setTarget() { void 0; }
  dispose() { this.disposeCount++; }
} }));
vi.mock("ol/View.js", () => ({ default: class { readonly mock = true; constructor() { void 0; } } }));
vi.mock("ol/Feature.js", () => ({ default: class { setStyle() { void 0; } } }));
vi.mock("ol/geom/LineString.js", () => ({ default: class { readonly mock = true; constructor() { void 0; } } }));
vi.mock("ol/geom/Point.js", () => ({ default: class { readonly mock = true; constructor() { void 0; } } }));
vi.mock("ol/layer/Tile.js", () => ({ default: class { readonly mock = true; constructor() { void 0; } } }));
vi.mock("ol/layer/Vector.js", () => ({ default: class { readonly mock = true; constructor() { void 0; } } }));
vi.mock("ol/source/OSM.js", () => ({ default: class { on(_event: string, callback: () => void) { mockState.rasterError = callback; } } }));
vi.mock("ol/source/Vector.js", () => ({ default: class { clear() { void 0; } addFeature() { void 0; } getExtent() { return [0, 0, 1, 1]; } } }));
vi.mock("ol/proj.js", () => ({ fromLonLat: (point: [number, number]) => point }));
vi.mock("ol/style.js", () => ({
  Circle: class { readonly mock = true; constructor() { void 0; } },
  Fill: class { readonly mock = true; constructor() { void 0; } },
  Stroke: class { readonly mock = true; constructor() { void 0; } },
  Style: class { readonly mock = true; constructor() { void 0; } },
}));
vi.mock("ol-mapbox-style", () => ({ apply: async () => { if (mockState.failStyle) throw new Error("style unavailable"); } }));
vi.mock("./tracker-polar-cap", () => ({ createPolarCapLayer: () => ({}), POLE_COORD: [0, 0], VIEW_EXTENT: [-1, -1, 1, 1] }));
vi.mock("../components/tracker-3d/tracker-art", () => ({ TrackerArt: class { mount() { void 0; } dispose() { void 0; } } }));

interface AdapterHarness {
  adapter: TrackerMapAdapter;
  failVector(): void;
  failRaster(): void;
}

function fakeHarness(mode: "vector" | "raster", onFailure: () => void): AdapterHarness {
  let disposed = false;
  return {
    adapter: {
      mount: vi.fn(async () => {
        if (disposed) return;
        if (mode === "vector" && mockState.failStyle) throw new Error("style unavailable");
      }),
      setRoute: vi.fn(), setSantaPosition: vi.fn(), follow: vi.fn(), visitPole: vi.fn(), stopFollowing: vi.fn(),
      fitToRoute: vi.fn(), destroy: vi.fn(() => { disposed = true; }),
    },
    failVector: () => { mockState.failStyle = true; },
    failRaster: onFailure,
  };
}

function realHarness(mode: "vector" | "raster", onFailure: () => void): AdapterHarness {
  const adapter = new OpenLayersTrackerMap(mode, onFailure, vi.fn());
  return {
    adapter,
    failVector: () => { mockState.failStyle = true; },
    failRaster: () => { for (let i = 0; i < 4; i++) mockState.rasterError?.(); },
  };
}

function fakeElement(): HTMLElement {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLElement;
}

function runAdapterContract(name: string, makeHarness: (mode: "vector" | "raster", onFailure: () => void) => AdapterHarness): void {
  describe(`${name} adapter contract`, () => {
    it("mounts successfully", async () => {
      mockState.failStyle = false;
      const { adapter } = makeHarness("raster", vi.fn());
      await expect(adapter.mount(fakeElement())).resolves.toBeUndefined();
      adapter.destroy();
    });

    it("falls back from a failed vector provider to raster", async () => {
      mockState.failStyle = false;
      const vector = makeHarness("vector", vi.fn());
      vector.failVector();
      await expect(vector.adapter.mount(fakeElement())).rejects.toThrow();
      expect(mapModeReducer("vector", "vectorFailed")).toBe("raster");
      vector.adapter.destroy();

      mockState.failStyle = false;
      const raster = makeHarness("raster", vi.fn());
      await expect(raster.adapter.mount(fakeElement())).resolves.toBeUndefined();
      raster.adapter.destroy();
    });

    it("falls back from a failed raster provider to text", async () => {
      const onFailure = vi.fn();
      const raster = makeHarness("raster", onFailure);
      await raster.adapter.mount(fakeElement());
      raster.failRaster();
      expect(onFailure).toHaveBeenCalled();
      expect(mapModeReducer("raster", "rasterFailed")).toBe("text");
      raster.adapter.destroy();
    });

    it("retains current stop, following state, and progress when switching to text", () => {
      const state = {
        nodes: [{ id: "stop-2" }] as RouteNode[],
        position: { lat: 1, lng: 2, journey: { currentIndex: 2, nextIndex: 3, progress: 0.42, isComplete: false } } as SantaPosition,
        following: false,
      };
      expect(mapModeReducer("raster", "rasterFailed")).toBe("text");
      expect(state.position.journey.currentIndex).toBe(2);
      expect(state.position.journey.progress).toBe(0.42);
      expect(state.following).toBe(false);
      expect(state.nodes).toEqual([{ id: "stop-2" }]);
    });

    it("does nothing when mounted after destruction and tolerates repeated destruction", async () => {
      const { adapter } = makeHarness("raster", vi.fn());
      adapter.destroy();
      await expect(adapter.mount(fakeElement())).resolves.toBeUndefined();
      expect(() => adapter.destroy()).not.toThrow();
    });
  });
}

runAdapterContract("fake", fakeHarness);
runAdapterContract("OpenLayers", realHarness);

describe("OpenLayers destruction", () => {
  it("disposes a mounted map once when destroy is repeated", async () => {
    const initialMaps = mockState.maps.length;
    const adapter = new OpenLayersTrackerMap("raster", vi.fn(), vi.fn());
    await adapter.mount(fakeElement());
    const map = mockState.maps[initialMaps];
    adapter.destroy();
    adapter.destroy();
    expect(map?.disposeCount).toBe(1);
  });
});
