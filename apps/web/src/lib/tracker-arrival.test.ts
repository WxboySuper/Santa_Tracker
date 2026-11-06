import { describe, expect, it } from "vitest";
import { estimateArrival } from "./tracker-arrival";
import type { RouteNode } from "./locations";

const route = [
  { id: "east", type: "DELIVERY", location: { name: "East", lat: 40, lng: -73, timezone_offset: -5 }, schedule: { arrival_utc: "2026-12-25T02:00:00Z" } },
  { id: "west", type: "DELIVERY", location: { name: "West", lat: 37, lng: -122, timezone_offset: -8 }, schedule: { arrival_utc: "2026-12-25T07:00:00Z" } },
] as RouteNode[];

describe("estimateArrival", () => {
  it("selects the nearest future stop by coordinates using the injected clock", () => {
    const result = estimateArrival({ name: "San Francisco", lat: 37.7, lng: -122.4 }, route, new Date("2026-12-25T00:00:00Z"));
    expect(result?.stop.location.name).toBe("West");
    expect(result?.at.toISOString()).toBe("2026-12-25T07:00:00.000Z");
  });

  it("uses timezone offset when coordinates are unavailable", () => {
    const result = estimateArrival({ name: "New York", timezone: "America/New_York" }, route, new Date("2026-12-25T00:00:00Z"));
    expect(result?.stop.location.name).toBe("East");
  });
});
