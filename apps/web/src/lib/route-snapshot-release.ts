import { validateLocations } from "./locations";

type IssueSeverity = "error" | "warning";

export interface RouteSnapshotValidationReport {
  valid: boolean;
  issueCount: number;
  issues: { path: string; message: string; severity: IssueSeverity }[];
  checksum: string;
  schema: "legacy-route-v1";
  season: number | null;
}

export async function validateRouteSnapshot(body: string): Promise<RouteSnapshotValidationReport> {
  const result = parseSnapshot(body);
  if (result.error) return report([issue("$", result.error)], body, null);
  const { season, nodes } = result;
  const issues: RouteSnapshotValidationReport["issues"] = [];
  if (season === null) issues.push(issue("meta.year", "Snapshot must include an integer season year"));
  if (nodes.length === 0) issues.push(issue("route_nodes", "Snapshot must contain at least one route node"));
  validateLocationsIntoIssues(nodes, issues);
  validateRouteTimes(nodes, issues);
  validateNodeReferences(nodes, issues);
  return report(issues, body, season);
}

function parseSnapshot(body: string): { season: number | null; nodes: unknown[]; error?: string } {
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { return { season: null, nodes: [], error: "Snapshot must be valid JSON" }; }
  if (!isRecord(value)) return { season: null, nodes: [], error: "Snapshot must be a route object" };
  const meta = isRecord(value.meta) ? value.meta : null;
  const season = meta && typeof meta.year === "number" && Number.isInteger(meta.year) ? meta.year : null;
  if (!Array.isArray(value.route_nodes)) return { season, nodes: [], error: "Snapshot must contain a route_nodes list" };
  return { season, nodes: value.route_nodes };
}

function validateLocationsIntoIssues(nodes: unknown[], issues: RouteSnapshotValidationReport["issues"]): void {
  const report = validateLocations(nodes as Parameters<typeof validateLocations>[0]);
  report.errors.forEach(message => issues.push(issue(routeNodePath(message), message)));
  report.warnings.forEach(message => issues.push(issue(routeNodePath(message), message, "warning")));
}

function routeNodePath(message: string): string {
  const match = /index (\d+)/.exec(message);
  return match ? `route_nodes[${match[1]}]` : "route_nodes";
}

function validateNodeReferences(nodes: unknown[], issues: RouteSnapshotValidationReport["issues"]): void {
  const ids = new Map<string, number>();
  nodes.forEach((node, index) => {
    if (!isRecord(node) || typeof node.id !== "string" || node.id.trim().length === 0) {
      issues.push(issue(`route_nodes[${index}].id`, "Route node must have a non-empty id"));
      return;
    }
    const previous = ids.get(node.id);
    if (previous !== undefined) issues.push(issue(`route_nodes[${index}].id`, `Duplicate route node id at indices ${previous} and ${index}`));
    else ids.set(node.id, index);
  });
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
        issues.push(issue(`route_nodes[${index}].schedule.${field}`, "Schedule time must be a valid date-time"));
      }
    }
    const arrival = schedule.arrival_utc;
    const departure = schedule.departure_utc;
    if (typeof arrival === "string" && typeof departure === "string" && Date.parse(departure) < Date.parse(arrival)) {
      issues.push(issue(`route_nodes[${index}].schedule.departure_utc`, "Departure must not be before arrival"));
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
  return {
    valid: issues.every(item => item.severity !== "error"),
    issueCount: issues.length,
    issues,
    checksum,
    schema: "legacy-route-v1",
    season,
  };
}

function issue(path: string, message: string, severity: IssueSeverity = "error") {
  return { path, message, severity };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
