import { describe, expect, it } from "vitest";
import { deriveJourneyState } from "@santa-tracker/route-engine";
import type { RouteNode } from "../locations";
import { routeNodesToContractRoute } from "../route-bridge";
import { computeSantaPosition } from "../tracker-position";

const sampleNodes: RouteNode[] = [
  {
    id: "north-pole",
    type: "START",
    location: { name: "North Pole", lat: 80, lng: 0, timezone_offset: 0 },
    schedule: { arrival_utc: "2026-12-24T00:00:00.000Z", departure_utc: "2026-12-24T01:00:00.000Z" },
    stop_experience: { duration_seconds: 0 },
  },
  {
    id: "london",
    type: "DELIVERY",
    location: { name: "London", lat: 51.5, lng: -0.1, timezone_offset: 0 },
    schedule: { arrival_utc: "2026-12-24T02:00:00.000Z", departure_utc: "2026-12-24T02:30:00.000Z" },
    stop_experience: { duration_seconds: 0 },
  },
];

describe("tracker position", () => {
  it("derives journey state from published nodes", () => {
    const { route } = routeNodesToContractRoute(sampleNodes);
    const state = deriveJourneyState(route, new Date("2026-12-24T01:30:00.000Z"));
    expect(state.isComplete).toBe(false);
    expect(state.currentIndex).not.toBeNull();
  });

  it("interpolates Santa between timed stops", () => {
    const position = computeSantaPosition(sampleNodes, new Date("2026-12-24T01:30:00.000Z"));
    expect(position).not.toBeNull();
    expect(position?.lat).toBeGreaterThan(51);
    expect(position?.lat).toBeLessThan(80);
  });
});

describe("tracker position across the antimeridian", () => {
  const crossing: RouteNode[] = [
    {
      id: "a",
      type: "START",
      location: { name: "West of line", lat: 0, lng: 179, timezone_offset: 12 },
      schedule: { arrival_utc: "2026-12-24T00:00:00.000Z", departure_utc: "2026-12-24T01:00:00.000Z" },
      stop_experience: { duration_seconds: 0 },
    },
    {
      id: "b",
      type: "DELIVERY",
      location: { name: "East of line", lat: 0, lng: -179, timezone_offset: -12 },
      schedule: { arrival_utc: "2026-12-24T03:00:00.000Z", departure_utc: "2026-12-24T03:30:00.000Z" },
      stop_experience: { duration_seconds: 0 },
    },
  ];

  it("takes the short way across the dateline instead of sweeping through lng 0", () => {
    const position = computeSantaPosition(crossing, new Date("2026-12-24T02:00:00.000Z"));
    expect(position).not.toBeNull();
    expect(Math.abs(position!.lng)).toBeGreaterThan(178);
  });
});
