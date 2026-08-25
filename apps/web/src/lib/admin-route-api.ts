import {
  createLocationFromPayload,
  deleteTrialRoute,
  getRouteStatus,
  hasTrialRoute,
  loadSantaRouteFromJson,
  loadTrialRouteFromJson,
  saveSantaRouteToJson,
  saveTrialRouteToJson,
  validateLocations,
  type LocationEntry,
} from "./locations";
import { buildSimulatedFromLocations } from "./route-sim";
import { badRequest, isRecord, notFoundAwareError, type AdminApiResult } from "./admin-api";

const ROUTE_NOT_FOUND_BODY = { error: "Route data not found" };

export async function routeStatus(): Promise<AdminApiResult> {
  try {
    return { status: 200, body: await getRouteStatus() };
  } catch (error) {
    return notFoundAwareError(error, ROUTE_NOT_FOUND_BODY);
  }
}

export async function simulateMainRoute(payload: unknown): Promise<AdminApiResult> {
  try {
    return await simulateStoredLocations(payload);
  } catch (error) {
    return simulationError(error, ROUTE_NOT_FOUND_BODY);
  }
}

async function simulateStoredLocations(payload: unknown): Promise<AdminApiResult> {
  const locations = await loadSantaRouteFromJson();
  if (locations.length === 0) return badRequest("No locations to simulate");
  const result = buildSimulatedFromLocations(locations, extractLocationIds(payload));
  return { status: 200, body: asRecord(result) };
}

function extractLocationIds(payload: unknown): number[] | null {
  if (!isRecord(payload)) return null;
  return (payload.location_ids ?? null) as number[] | null;
}

function simulationError(error: unknown, notFoundBody: Record<string, unknown>): AdminApiResult {
  if (error instanceof Error && error.message === "location_ids must be a list") {
    return badRequest("location_ids must be a list");
  }
  return notFoundAwareError(error, notFoundBody);
}

interface TimingIssueEntry {
  index: number;
  name: string | null;
  issues: Record<string, string>;
}

export async function precomputeTimings(): Promise<AdminApiResult> {
  try {
    return await verifyAllTimings();
  } catch (error) {
    return notFoundAwareError(error, ROUTE_NOT_FOUND_BODY);
  }
}

async function verifyAllTimings(): Promise<AdminApiResult> {
  const locations = await loadSantaRouteFromJson();
  if (locations.length === 0) return badRequest("No locations to validate");

  const invalidTimes = collectTimingIssues(locations);
  if (invalidTimes.length > 0) {
    return {
      status: 400,
      body: {
        error: "Some locations have missing/invalid timing info",
        invalid_times: invalidTimes,
        message:
          "All locations must have explicit arrival_time and departure_time in ISO 8601 format. Calculation of timings is no longer supported.",
      },
    };
  }
  return {
    status: 200,
    body: {
      message: "All locations have valid timing information",
      total_locations: locations.length,
      status: "complete",
    },
  };
}

function collectTimingIssues(locations: LocationEntry[]): TimingIssueEntry[] {
  const issues: TimingIssueEntry[] = [];
  locations.forEach((location, index) => pushTimingIssue(location, index, issues));
  return issues;
}

function pushTimingIssue(location: LocationEntry, index: number, sink: TimingIssueEntry[]): void {
  if (index === 0 || isAnchor(location)) return;
  const problems = timingProblems(location);
  if (Object.keys(problems).length > 0) {
    sink.push({ index, name: location.name ?? null, issues: problems });
  }
}

function isAnchor(location: LocationEntry): boolean {
  return typeof location.type === "string" && location.type.toLowerCase() === "anchor";
}

function timingProblems(location: LocationEntry): Record<string, string> {
  const problems: Record<string, string> = {};
  addTimeProblem(problems, "arrival_time", location.arrival_time);
  addTimeProblem(problems, "departure_time", location.departure_time);
  return problems;
}

function addTimeProblem(problems: Record<string, string>, field: string, value: string | null | undefined): void {
  if (!value) {
    problems[field] = "missing";
    return;
  }
  if (!isValidIsoTimestamp(value)) problems[field] = "invalid format";
}

function isValidIsoTimestamp(value: string): boolean {
  const parsed = new Date(value.replace("Z", "+00:00"));
  return !Number.isNaN(parsed.getTime());
}

export async function uploadTrialRoute(payload: unknown): Promise<AdminApiResult> {
  try {
    return await storeTrialRoute(payload);
  } catch (error) {
    return notFoundAwareError(error, { error: "Route file not found" });
  }
}

async function storeTrialRoute(payload: unknown): Promise<AdminApiResult> {
  if (!isRecord(payload) || !Array.isArray(payload.route)) return badRequest("Route data required");
  const locations = buildTrialLocations(payload.route);
  if (!locations) return badRequest("Invalid location data.");

  const validation = validateLocations(locations);
  if (validation.errors.length > 0) {
    return {
      status: 400,
      body: { error: "Validation failed", errors: validation.errors, warnings: validation.warnings },
    };
  }
  await saveTrialRouteToJson(locations);
  return {
    status: 200,
    body: {
      success: true,
      message: `Trial route uploaded with ${locations.length} locations`,
      location_count: locations.length,
      warnings: validation.warnings,
    },
  };
}

function buildTrialLocations(routeItems: unknown[]): LocationEntry[] | null {
  const locations: LocationEntry[] = [];
  for (const item of routeItems) {
    try {
      locations.push(createLocationFromPayload(item as Record<string, unknown>));
    } catch {
      return null;
    }
  }
  return locations;
}

export async function trialRouteInfo(): Promise<AdminApiResult> {
  try {
    if (!(await hasTrialRoute())) {
      return { status: 200, body: { exists: false, location_count: 0 } };
    }
    const trial = await loadTrialRouteFromJson();
    return { status: 200, body: { exists: true, location_count: trial?.length ?? 0 } };
  } catch (error) {
    console.error(error);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

export async function removeTrialRoute(): Promise<AdminApiResult> {
  try {
    const deleted = await deleteTrialRoute();
    if (deleted) return { status: 200, body: { success: true, message: "Trial route deleted" } };
    return { status: 404, body: { success: false, message: "No trial route to delete" } };
  } catch (error) {
    console.error(error);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

export async function applyTrialRoute(): Promise<AdminApiResult> {
  try {
    return await promoteTrialToMain();
  } catch (error) {
    console.error(error);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

async function promoteTrialToMain(): Promise<AdminApiResult> {
  if (!(await hasTrialRoute())) return { status: 404, body: { error: "No trial route to apply" } };
  const trial = await loadTrialRouteFromJson();
  if (!trial || trial.length === 0) return badRequest("Trial route is empty");
  await saveSantaRouteToJson(trial);
  return {
    status: 200,
    body: { success: true, message: `Trial route applied as main route (${trial.length} locations)` },
  };
}

export async function simulateTrialRoute(payload: unknown): Promise<AdminApiResult> {
  try {
    return await simulateStoredTrial(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "location_ids must be a list") {
      return badRequest("location_ids must be a list");
    }
    console.error(error);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

async function simulateStoredTrial(payload: unknown): Promise<AdminApiResult> {
  if (!(await hasTrialRoute())) return { status: 404, body: { error: "No trial route to simulate" } };
  const locations = await loadTrialRouteFromJson();
  if (!locations || locations.length === 0) return badRequest("Trial route is empty");
  const result = buildSimulatedFromLocations(locations, extractLocationIds(payload));
  return { status: 200, body: { ...asRecord(result), is_trial: true } };
}

function asRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}
