import { describe, expect, it } from "vitest";
import { deriveTvDashboard, nextRouteStops } from "./tracker-tv";
import type { RouteNode } from "./locations";

const route = [
  { id: "one", type: "DELIVERY", location: { name: "Auckland", lat: -36.8, lng: 174.7, timezone_offset: 13 }, schedule: { arrival_utc: "2026-12-24T10:00:00Z" } },
  { id: "two", type: "DELIVERY", location: { name: "Tokyo", lat: 35.6, lng: 139.6, timezone_offset: 9 }, schedule: { arrival_utc: "2026-12-24T12:00:00Z" } },
  { id: "three", type: "DELIVERY", location: { name: "London", lat: 51.5, lng: -0.1, timezone_offset: 0 }, schedule: { arrival_utc: "2026-12-24T14:00:00Z" } },
  { id: "four", type: "DELIVERY", location: { name: "New York", lat: 40.7, lng: -74, timezone_offset: -5 }, schedule: { arrival_utc: "2026-12-24T18:00:00Z" } },
] as RouteNode[];
const now = new Date("2026-12-24T11:00:00Z");

describe("nextRouteStops", () => {
  it("returns the next three future stops after the current index", () => {
    expect(nextRouteStops({ nodes: route, currentIndex: 0, now, locale: "en-US" }).map(stop => stop.id)).toEqual(["two", "three", "four"]);
  });

  it("omits passed stops and tolerates a route with no current index", () => {
    expect(nextRouteStops({ nodes: route, currentIndex: null, now, locale: "en-US" }).map(stop => stop.id)).toEqual(["two", "three", "four"]);
    expect(nextRouteStops({ nodes: route, currentIndex: 3, now, locale: "en-US" })).toEqual([]);
  });
});

describe("deriveTvDashboard", () => {
  it("derives current stop, progress, local clocks, and the saved-place estimate from the injected time", () => {
    const data = deriveTvDashboard({ nodes: route, currentIndex: 0, progress: 0.456, place: { name: "Tokyo", lat: 35.6, lng: 139.6 }, now, locale: "en-US" });
    expect(data.current?.location.name).toBe("Auckland");
    expect(data.progressPercent).toBe(46);
    expect(data.santaLocalTime).toContain("12:00");
    expect(data.nextStops[0]?.localArrival).toContain("9:00");
    expect(data.visitorArrival?.toISOString()).toBe("2026-12-24T12:00:00.000Z");
  });

  it("clamps progress and returns no visitor estimate without a saved choice", () => {
    const data = deriveTvDashboard({ nodes: route, currentIndex: null, progress: 2, place: null, now, locale: "en-US" });
    expect(data.progressPercent).toBe(100);
    expect(data.visitorArrival).toBeNull();
    expect(data.current).toBeNull();
  });

  it("marks the route complete only when no stop remains, not when remaining stops have unusable times", () => {
    const base = { progress: 0.5, place: null, now, locale: "en-US" };
    expect(deriveTvDashboard({ ...base, nodes: route, currentIndex: 3 }).routeComplete).toBe(true);
    expect(deriveTvDashboard({ ...base, nodes: route, currentIndex: 0 }).routeComplete).toBe(false);
    const broken = route.map((node, index) => (index > 0 ? { ...node, schedule: { arrival_utc: "not a time" } } : node)) as RouteNode[];
    const data = deriveTvDashboard({ ...base, nodes: broken, currentIndex: 0 });
    expect(data.nextStops).toEqual([]);
    expect(data.routeComplete).toBe(false);
    expect(deriveTvDashboard({ ...base, nodes: route, currentIndex: null }).routeComplete).toBe(false);
  });
});
