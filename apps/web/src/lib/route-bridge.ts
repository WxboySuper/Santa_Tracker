import type { Route } from "@santa-tracker/contracts";
import { createLocationId, SCHEMA_VERSION } from "@santa-tracker/contracts/ids";
import type { RouteNode } from "./locations";

export function routeNodesToContractRoute(nodes: RouteNode[], season = 2026): { route: Route; timedNodes: RouteNode[] } {
  const timedNodes = nodes.filter(node => node.schedule?.arrival_utc && node.schedule?.departure_utc);
  const stops = timedNodes.map(node => ({
    locationId: createLocationId(node.id),
    arrivalIso: node.schedule!.arrival_utc!,
    departureIso: node.schedule!.departure_utc!,
    durationSeconds: node.stop_experience?.duration_seconds ?? 0,
  }));
  return {
    route: {
      schemaVersion: SCHEMA_VERSION,
      season,
      stops,
    },
    timedNodes,
  };
}
