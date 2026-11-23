import { describe, expect, it } from "vitest";
import { createClockSync, createMonotonicProgressGuard } from "../tracker-clock-sync";

describe("tracker clock sync", () => {
  it("estimates server offset from the client request midpoint", () => {
    const sync = createClockSync("1970-01-01T00:00:05.000Z", 0, 2_000);

    expect(sync.offsetMs).toBe(4_000);
    expect(sync.toServerTime(2_000).toISOString()).toBe("1970-01-01T00:00:06.000Z");
    expect(sync.toClientTime(6_000).getTime()).toBe(2_000);
  });

  it("supports zero round trip and a Date server timestamp", () => {
    const sync = createClockSync(new Date(10_000), 2_000, 2_000);
    expect(sync.offsetMs).toBe(8_000);
  });

  it.each([
    ["invalid server time", "bad", 0, 1],
    ["non-finite request time", "1970-01-01T00:00:00Z", Number.NaN, 1],
    ["reversed request times", "1970-01-01T00:00:00Z", 2, 1],
  ])("rejects %s", (_label, serverTime, started, received) => {
    expect(() => createClockSync(serverTime as string, started as number, received as number)).toThrow(RangeError);
  });
});

describe("monotonic journey progress", () => {
  it("retains progress after a regression larger than the tolerance", () => {
    const guard = createMonotonicProgressGuard(0.02);
    expect(guard(0.7, "v1")).toBe(0.7);
    expect(guard(0.69, "v1")).toBe(0.69);
    expect(guard(0.5, "v1")).toBe(0.69);
    expect(guard(0.8, "v1")).toBe(0.8);
  });

  it("accepts a new snapshot's progress even when it moves backwards", () => {
    const guard = createMonotonicProgressGuard();
    expect(guard(0.8, "v1")).toBe(0.8);
    expect(guard(0.1, "v2")).toBe(0.1);
  });

  it("clamps values and ignores non-finite progress", () => {
    const guard = createMonotonicProgressGuard();
    expect(guard(-1, "v1")).toBe(0);
    expect(guard(2, "v1")).toBe(1);
    expect(guard(Number.NaN, "v1")).toBe(1);
  });

  it("rejects an invalid tolerance", () => {
    expect(() => createMonotonicProgressGuard(-0.1)).toThrow(RangeError);
    expect(() => createMonotonicProgressGuard(1.1)).toThrow(RangeError);
  });
});
