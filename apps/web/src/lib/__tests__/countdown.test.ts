import { describe, expect, it } from "vitest";
import { formatCountdown, getCountdownParts, nextTakeoff } from "../countdown";

const takeoff = Date.UTC(2026, 11, 24, 10, 0, 0);

describe("nextTakeoff", () => {
  it("targets Dec 24 10:00 UTC this year until it passes, then next year", () => {
    expect(nextTakeoff(new Date("2026-11-05T00:00:00Z"))).toBe(takeoff);
    expect(nextTakeoff(new Date("2026-12-24T10:00:01Z"))).toBe(Date.UTC(2027, 11, 24, 10, 0, 0));
  });
});

describe("getCountdownParts", () => {
  it("splits the remaining time into whole units", () => {
    const now = new Date(takeoff - ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000);
    expect(getCountdownParts(takeoff, now)).toEqual({ done: false, days: 2, hours: 3, minutes: 4, seconds: 5 });
  });

  it("is done and all zero at and after takeoff", () => {
    const zero = { done: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
    expect(getCountdownParts(takeoff, new Date(takeoff))).toEqual(zero);
    expect(getCountdownParts(takeoff, new Date(takeoff + 5000))).toEqual(zero);
  });

  it("rolls 59:59 cleanly with no off-by-one at unit boundaries", () => {
    const now = new Date(takeoff - (3600 * 1000 - 1000));
    expect(getCountdownParts(takeoff, now)).toMatchObject({ days: 0, hours: 0, minutes: 59, seconds: 59 });
  });
});

describe("formatCountdown", () => {
  it("keeps the compact text format used by the tracker HUD", () => {
    const now = new Date(takeoff - ((1 * 24 + 2) * 3600 + 3 * 60 + 4) * 1000);
    expect(formatCountdown(takeoff, now)).toBe("1d 2h 3m 4s");
  });

  it("returns the supplied text once Santa is flying", () => {
    expect(formatCountdown(takeoff, new Date(takeoff), "Flying!")).toBe("Flying!");
  });
});
