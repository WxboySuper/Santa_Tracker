import type { Route } from "@santa-tracker/contracts";
import { createLocationId, SCHEMA_VERSION } from "@santa-tracker/contracts/ids";
import type { RouteNode } from "./locations";

export function routeNodesToContractRoute(nodes: RouteNode[], season = 2026): { route: Route; timedNodes: RouteNode[] } {
  const timedNodes: RouteNode[] = [];
  const stops = nodes.flatMap(node => {
    const arrivalIso = node.schedule?.arrival_utc;
    const departureIso = node.schedule?.departure_utc;
    if (!arrivalIso || !departureIso) return [];
    timedNodes.push(node);
    return [{
      locationId: createLocationId(node.id),
      arrivalIso,
      departureIso,
      durationSeconds: node.stop_experience?.duration_seconds ?? 0,
    }];
  });
  return {
    route: {
      schemaVersion: SCHEMA_VERSION,
      season,
      stops,
    },
    timedNodes,
  };
}
