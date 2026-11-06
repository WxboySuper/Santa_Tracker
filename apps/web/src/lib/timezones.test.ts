import { describe, expect, it } from "vitest";
import { getCityClocks, getDecemberMidnightUtc, getOrderedCityIds, getUtcOffsetMinutes, parseTimezones, REFERENCE_END_UTC, REFERENCE_START_UTC } from "./timezones";

describe("timezone puzzle", () => {
  it("accepts only the timezones activity payload", () => {
    expect(parseTimezones({ kind: "timezones" })).toEqual({ kind: "timezones" });
    expect(parseTimezones({ kind: "timezones", unexpected: true })).toEqual({ kind: "timezones" });
    expect(parseTimezones(null)).toBeNull();
    expect(parseTimezones({ kind: "maze" })).toBeNull();
  });

  it("uses December offsets, including Auckland summer time", () => {
    const december = Date.UTC(2026, 11, 24, 12);
    expect(getUtcOffsetMinutes(december, "Pacific/Auckland")).toBe(13 * 60);
    expect(getUtcOffsetMinutes(december, "Europe/London")).toBe(0);
    expect(getUtcOffsetMinutes(december, "Africa/Cairo")).toBe(2 * 60);
    expect(getUtcOffsetMinutes(december, "Pacific/Honolulu")).toBe(-10 * 60);
  });

  it("orders the six cities by their Dec 25 midnight and formats injected instants", () => {
    expect(getOrderedCityIds(REFERENCE_START_UTC)).toEqual(["kiritimati", "auckland", "tokyo", "cairo", "london", "honolulu"]);
    const clocks = getCityClocks(REFERENCE_START_UTC, "en-US");
    expect(clocks.find(({ id }) => id === "kiritimati")?.localDate).toContain("Dec 25");
    expect(clocks.find(({ id }) => id === "auckland")?.offsetMinutes).toBe(780);
    expect(getDecemberMidnightUtc("Pacific/Auckland", 2026)).toBe(Date.UTC(2026, 11, 24, 11));
    expect(REFERENCE_END_UTC - REFERENCE_START_UTC).toBe(28 * 60 * 60 * 1000);
  });
});
