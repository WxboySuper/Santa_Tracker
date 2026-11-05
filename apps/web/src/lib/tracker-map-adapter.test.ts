import { describe, expect, it, vi } from "vitest";
import type { RouteNode } from "./locations";
import type { SantaPosition } from "./tracker-position";
import { isMapInteractionKey, mapModeReducer, syncMapState, type TrackerMapAdapter } from "./tracker-map-adapter";
import { styleDeadline } from "./tracker-map-timeout";

describe("map fallback", () => {
  it("falls through vector, raster, and text, and permits a retry", () => {
    expect(mapModeReducer("vector", "vectorFailed")).toBe("raster");
    expect(mapModeReducer("raster", "rasterFailed")).toBe("text");
    expect(mapModeReducer("text", "showMap")).toBe("vector");
    expect(mapModeReducer("vector", "showText")).toBe("text");
    expect(mapModeReducer("vector", "initFailed")).toBe("text");
    expect(mapModeReducer("text", "vectorFailed")).toBe("text");
  });

  it("supports the provider boundary with a fake adapter", async () => {
    const fake: TrackerMapAdapter = {
      mount: vi.fn().mockResolvedValue(undefined), setRoute: vi.fn(), setSantaPosition: vi.fn(),
      follow: vi.fn(), stopFollowing: vi.fn(), fitToRoute: vi.fn(), destroy: vi.fn(),
    };
    await fake.mount({} as HTMLElement);
    fake.setRoute([]);
    fake.follow();
    fake.stopFollowing();
    fake.fitToRoute();
    fake.destroy();
    expect(fake.mount).toHaveBeenCalledOnce();
    expect(fake.destroy).toHaveBeenCalledOnce();
  });

  it("syncs current route state after the asynchronous map mount completes", () => {
    const fake: TrackerMapAdapter = {
      mount: vi.fn().mockResolvedValue(undefined), setRoute: vi.fn(), setSantaPosition: vi.fn(),
      follow: vi.fn(), stopFollowing: vi.fn(), fitToRoute: vi.fn(), destroy: vi.fn(),
    };
    const currentPosition = { lat: 10, lng: 20, journey: { currentIndex: 0, nextIndex: 1, progress: 0.5, isComplete: false } } as SantaPosition;
    const latestNodes = [{ id: "current-route" }] as RouteNode[];
    syncMapState(fake, latestNodes, currentPosition);
    expect(fake.setRoute).toHaveBeenCalledWith(latestNodes);
    expect(fake.setSantaPosition).toHaveBeenCalledWith(currentPosition);
  });

  it("uses an injected clock for the style timeout", async () => {
    let callback!: () => void;
    const clear = vi.fn();
    const deadline = styleDeadline(6000, {
      set: (fn, delay) => { expect(delay).toBe(6000); callback = fn; return 1 as unknown as ReturnType<typeof setTimeout>; },
      clear,
    });
    const result = expect(deadline.promise).rejects.toThrow("timed out");
    callback();
    await result;
    deadline.clear();
    expect(clear).toHaveBeenCalledOnce();
  });

  it("uses browser timers without losing their receiver", async () => {
    vi.useFakeTimers();
    try {
      const deadline = styleDeadline(10);
      const result = expect(deadline.promise).rejects.toThrow("Map style timed out");
      await vi.advanceTimersByTimeAsync(10);
      await result;
    } finally {
      vi.useRealTimers();
    }
  });
});

it("stops following only for map movement and zoom keys", () => {
  for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "-", "PageUp", "PageDown"]) {
    expect(isMapInteractionKey(key)).toBe(true);
  }
  for (const key of ["Tab", "Shift", "Escape", "a"]) {
    expect(isMapInteractionKey(key)).toBe(false);
  }
});
