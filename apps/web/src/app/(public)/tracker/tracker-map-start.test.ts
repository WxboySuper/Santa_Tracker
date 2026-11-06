import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapRuntime } from "./tracker-map-types";

const mapMethods = vi.hoisted(() => ({
  mount: vi.fn<() => Promise<void>>(),
  destroy: vi.fn(),
  setRoute: vi.fn(),
  setSantaPosition: vi.fn(),
}));

vi.mock("@/lib/openlayers-tracker-map", () => ({
  OpenLayersTrackerMap: class {
    mount = mapMethods.mount;
    destroy = mapMethods.destroy;
    setRoute = mapMethods.setRoute;
    setSantaPosition = mapMethods.setSantaPosition;
  },
  StyleLoadError: class StyleLoadError extends Error {},
}));

import { startAdapter } from "./tracker-map-start";

function createRuntime(): Omit<MapRuntime, "mode"> & { mode: "vector" } {
  return {
    mode: "vector",
    element: { current: {} as HTMLDivElement },
    nodes: [],
    position: null,
    dispatch: vi.fn(),
    stopFollowing: vi.fn(),
    adapter: { current: null },
  };
}

describe("startAdapter lifecycle", () => {
  beforeEach(() => {
    mapMethods.mount.mockReset();
    mapMethods.destroy.mockReset();
    mapMethods.setRoute.mockReset();
    mapMethods.setSantaPosition.mockReset();
    mapMethods.mount.mockResolvedValue(undefined);
  });

  it("destroys and detaches the map when cancelled during mount", async () => {
    let finishMount!: () => void;
    mapMethods.mount.mockImplementation(() => new Promise(resolve => { finishMount = resolve; }));
    const runtime = createRuntime();
    let cancelled = false;

    const starting = startAdapter(runtime, () => cancelled);
    await vi.waitFor(() => expect(mapMethods.mount).toHaveBeenCalledOnce());
    cancelled = true;
    finishMount();

    expect(await starting).toEqual({});
    expect(mapMethods.destroy).toHaveBeenCalledOnce();
    expect(runtime.adapter.current).toBeNull();
  });

  it("destroys failed mounts and clears the active adapter", async () => {
    mapMethods.mount.mockRejectedValue(new Error("mount failed"));
    const runtime = createRuntime();

    expect(await startAdapter(runtime, () => false)).toEqual({ failure: "initFailed" });
    expect(mapMethods.destroy).toHaveBeenCalledOnce();
    expect(runtime.adapter.current).toBeNull();
  });

  it("reports a missing target instead of silently leaving a blank map", async () => {
    const runtime = createRuntime();
    runtime.element.current = null;

    expect(await startAdapter(runtime, () => false)).toEqual({ failure: "initFailed" });
  });
});
