import { describe, expect, it } from "vitest";
import { winterWorldEntries } from "../winter-world-data";
import { isWinterWorldTonight, parseLitEntryIds, parseWinterWorld, projectWinterWorldPoint } from "../winter-world";

describe("winter world activity", () => {
  it("accepts only a winterworld payload with a known optional focus", () => {
    expect(parseWinterWorld({ kind: "winterworld" })).toEqual({});
    expect(parseWinterWorld({ kind: "winterworld", focus: "yalda" })).toEqual({ focus: "yalda" });
    expect(parseWinterWorld({ kind: "winterworld", focus: "unknown" })).toBeNull();
    expect(parseWinterWorld({ kind: "winterworld", focus: 3 })).toBeNull();
    expect(parseWinterWorld(null)).toBeNull();
    expect(parseWinterWorld({ kind: "cipher" })).toBeNull();
  });

  it("marks fixed dates from an injected local clock, including ranges across New Year", () => {
    const posadas = winterWorldEntries.find((entry) => entry.id === "posadas");
    const kwanzaa = winterWorldEntries.find((entry) => entry.id === "kwanzaa");
    const lucia = winterWorldEntries.find((entry) => entry.id === "lucia");
    const hanukkah = winterWorldEntries.find((entry) => entry.id === "hanukkah");
    expect(posadas).toBeDefined();
    expect(kwanzaa).toBeDefined();
    expect(lucia).toBeDefined();
    expect(hanukkah).toBeDefined();
    if (!posadas || !kwanzaa || !lucia || !hanukkah) return;

    expect(isWinterWorldTonight(posadas, new Date(2026, 11, 16))).toBe(true);
    expect(isWinterWorldTonight(posadas, new Date(2026, 11, 25))).toBe(false);
    expect(isWinterWorldTonight(kwanzaa, new Date(2027, 0, 1))).toBe(true);
    expect(isWinterWorldTonight(lucia, new Date(2026, 11, 14))).toBe(false);
    expect(isWinterWorldTonight(hanukkah, new Date(2026, 11, 10))).toBeNull();
    expect(isWinterWorldTonight(lucia, new Date(Number.NaN))).toBeNull();
  });

  it("drops malformed saved candle ids and projects map points into the SVG", () => {
    expect(parseLitEntryIds(["lucia", "lucia", 2, "missing"])).toEqual(["lucia"]);
    expect(parseLitEntryIds({ lit: ["yalda"] })).toEqual([]);
    const entry = winterWorldEntries.find((item) => item.id === "lucia");
    expect(entry).toBeDefined();
    if (!entry) return;
    const point = projectWinterWorldPoint(entry);
    expect(point.x).toBeGreaterThanOrEqual(40);
    expect(point.x).toBeLessThanOrEqual(760);
    expect(point.y).toBeGreaterThanOrEqual(24);
    expect(point.y).toBeLessThanOrEqual(216);
  });
});
