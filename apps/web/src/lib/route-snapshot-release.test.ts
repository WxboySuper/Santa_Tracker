import { describe, expect, it } from "vitest";
import { validateRouteSnapshot } from "./route-snapshot-release";

const validRoute = JSON.stringify({
  meta: { year: 2026, route_version: "test", generated_at: "2026-11-01T00:00:00Z" },
  route_nodes: [{
    id: "north-pole",
    type: "anchor",
    location: { name: "North Pole", region: "Arctic", lat: 90, lng: 0, timezone_offset: 0 },
    schedule: { arrival_utc: "2026-12-24T00:00:00Z", departure_utc: "2026-12-24T00:01:00Z" },
    stop_experience: {},
    transit_to_here: null,
  }],
});

describe("route snapshot validation", () => {
  it("returns route season, schema, and a stable content checksum", async () => {
    const result = await validateRouteSnapshot(validRoute);
    expect(result).toMatchObject({ valid: true, issueCount: 0, schema: "legacy-route-v1", season: 2026 });
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect((await validateRouteSnapshot(validRoute)).checksum).toBe(result.checksum);
  });

  it("rejects malformed JSON and missing route fields", async () => {
    expect(await validateRouteSnapshot("{")).toMatchObject({ valid: false, season: null, issueCount: 1 });
    expect(await validateRouteSnapshot(JSON.stringify({ route_nodes: [] }))).toMatchObject({ valid: false, season: null });
  });

  it("rejects invalid coordinates and departure before arrival", async () => {
    const route = JSON.parse(validRoute) as { route_nodes: Record<string, unknown>[]; meta: Record<string, unknown> };
    const node = route.route_nodes[0]!;
    node.location = { name: "North Pole", region: "Arctic", lat: 91, lng: 0, timezone_offset: 0 };
    node.schedule = { arrival_utc: "2026-12-24T00:02:00Z", departure_utc: "2026-12-24T00:01:00Z" };
    const result = await validateRouteSnapshot(JSON.stringify(route));
    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.path)).toEqual(expect.arrayContaining([
      expect.stringContaining("route_nodes"),
      "route_nodes[0].schedule.departure_utc",
    ]));
  });
});
