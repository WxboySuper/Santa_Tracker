import { loadSantaRouteFromJson, validateLocations } from "./locations";

export interface RouteSnapshotValidationReport {
  valid: boolean;
  issueCount: number;
  issues: { path: string; message: string }[];
  checksum: string;
  schema: "legacy-route-v1";
  season: number | null;
}

export async function validateRouteSnapshot(body: string): Promise<RouteSnapshotValidationReport> {
  const issues: RouteSnapshotValidationReport["issues"] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    issues.push({ path: "$", message: "Snapshot must be valid JSON" });
    return report(issues, body, null);
  }

  if (!isRecord(parsed)) {
    issues.push({ path: "$", message: "Snapshot must be a route object" });
    return report(issues, body, null);
  }
  const meta = isRecord(parsed.meta) ? parsed.meta : null;
  const season = meta && Number.isInteger(meta.year) && typeof meta.year === "number" ? meta.year : null;
  if (season === null) issues.push({ path: "meta.year", message: "Snapshot must include an integer season year" });
  if (!Array.isArray(parsed.route_nodes) || parsed.route_nodes.length === 0) {
    issues.push({ path: "route_nodes", message: "Snapshot must contain at least one route node" });
    return report(issues, body, season);
  }

  try {
    const locations = await loadSantaRouteFromJson(body);
    const routeReport = validateLocations(locations);
    routeReport.errors.forEach((message, index) => issues.push({ path: `route_nodes[${index}]`, message }));
    routeReport.warnings.forEach((message, index) => issues.push({ path: `route_nodes.warning[${index}]`, message }));
    validateRouteTimes(parsed.route_nodes, issues);
  } catch (error) {
    issues.push({ path: "route_nodes", message: error instanceof Error ? error.message : "Route could not be parsed" });
  }
  return report(issues, body, season);
}

function validateRouteTimes(nodes: unknown[], issues: RouteSnapshotValidationReport["issues"]): void {
  nodes.forEach((node, index) => {
    if (!isRecord(node)) return;
    const schedule = isRecord(node.schedule) ? node.schedule : null;
    if (!schedule) return;
    for (const field of ["arrival_utc", "departure_utc"] as const) {
      const value = schedule[field];
      if (value === null || value === undefined) continue;
      if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
        issues.push({ path: `route_nodes[${index}].schedule.${field}`, message: "Schedule time must be a valid date-time" });
      }
    }
    const arrival = schedule.arrival_utc;
    const departure = schedule.departure_utc;
    if (typeof arrival === "string" && typeof departure === "string" && Date.parse(departure) < Date.parse(arrival)) {
      issues.push({ path: `route_nodes[${index}].schedule.departure_utc`, message: "Departure must not be before arrival" });
    }
  });
}

async function report(
  issues: RouteSnapshotValidationReport["issues"],
  body: string,
  season: number | null,
): Promise<RouteSnapshotValidationReport> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const checksum = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const errors = issues.filter(issue => !issue.path.includes(".warning["));
  return {
    valid: errors.length === 0,
    issueCount: issues.length,
    issues,
    checksum,
    schema: "legacy-route-v1",
    season,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
