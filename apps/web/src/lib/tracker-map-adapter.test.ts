import { describe, expect, it, vi } from "vitest";
import { mapModeReducer, type TrackerMapAdapter } from "./tracker-map-adapter";
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
});
