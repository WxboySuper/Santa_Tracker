import {
  createLocationFromPayload,
  loadSantaRouteFromJson,
  saveSantaRouteToJson,
  validateLocations,
  type LocationEntry,
} from "./locations";
import { badRequest, isRecord, notFoundAwareError, type AdminApiResult } from "./admin-api";

const REQUIRED_CREATE_FIELDS = ["name", "latitude", "longitude", "utc_offset"];
const INVALID_DATA_MESSAGE = "Invalid data format or values";
const NOT_FOUND_BODY = { error: "Location data not found" };

interface NumericRange {
  min: number;
  max: number;
}

const LATITUDE_RANGE: NumericRange = { min: -90, max: 90 };
const LONGITUDE_RANGE: NumericRange = { min: -180, max: 180 };
const UTC_OFFSET_RANGE: NumericRange = { min: -12, max: 14 };

function contains(range: NumericRange, value: number): boolean {
  return value >= range.min && value <= range.max;
}

function isOutside(range: NumericRange, value: number): boolean {
  return !contains(range, value);
}

export async function listLocations(): Promise<AdminApiResult> {
  try {
    const locations = await loadSantaRouteFromJson();
    return { status: 200, body: { locations: locations.map(serializeListedLocation) } };
  } catch (error) {
    return notFoundAwareError(error, NOT_FOUND_BODY);
  }
}

function serializeListedLocation(location: LocationEntry, index: number): Record<string, unknown> {
  return { id: index, ...serializeLocationFields(location) };
}

function serializeLocationFields(location: LocationEntry): Record<string, unknown> {
  return {
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    utc_offset: location.utc_offset,
    arrival_time: location.arrival_time,
    departure_time: location.departure_time,
    country: location.country,
    population: location.population,
    priority: location.priority,
    notes: location.notes,
    fun_facts: location.notes,
    stop_duration: location.stop_duration,
    is_stop: location.is_stop,
  };
}

export async function addLocation(payload: unknown): Promise<AdminApiResult> {
  try {
    return await appendLocation(payload);
  } catch (error) {
    return notFoundAwareError(error, NOT_FOUND_BODY);
  }
}

async function appendLocation(payload: unknown): Promise<AdminApiResult> {
  if (!isRecord(payload)) return badRequest("No data provided");
  const missing = REQUIRED_CREATE_FIELDS.filter(field => !(field in payload));
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing}`);
  if (hasInvalidCreateCoordinates(payload)) return badRequest(INVALID_DATA_MESSAGE);

  let newLocation: LocationEntry;
  try {
    newLocation = createLocationFromPayload(payload);
  } catch {
    return badRequest(INVALID_DATA_MESSAGE);
  }
  const locations = await loadSantaRouteFromJson();
  locations.push(newLocation);
  await saveSantaRouteToJson(locations);
  return {
    status: 201,
    body: {
      message: "Location added successfully",
      id: locations.length - 1,
      location: createdLocationSummary(newLocation),
    },
  };
}

function hasInvalidCreateCoordinates(payload: Record<string, unknown>): boolean {
  const lat = Number(payload.latitude);
  const lon = Number(payload.longitude);
  const tz = Number(payload.utc_offset);
  const values = [lat, lon, tz];
  if (values.some(value => Number.isNaN(value))) return true;
  return !(contains(LATITUDE_RANGE, lat) && contains(LONGITUDE_RANGE, lon) && contains(UTC_OFFSET_RANGE, tz));
}

function createdLocationSummary(location: LocationEntry): Record<string, unknown> {
  return {
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    utc_offset: location.utc_offset,
  };
}

export async function updateLocation(locationId: number, payload: unknown): Promise<AdminApiResult> {
  try {
    return await applyLocationUpdate(locationId, payload);
  } catch (error) {
    return notFoundAwareError(error, NOT_FOUND_BODY);
  }
}

async function applyLocationUpdate(locationId: number, payload: unknown): Promise<AdminApiResult> {
  if (!isRecord(payload)) return badRequest("No data provided");
  const locations = await loadSantaRouteFromJson();
  const existing = locations[locationId];
  if (!existing || !isValidIndex(locationId, locations.length)) {
    return { status: 404, body: { error: "Location not found" } };
  }
  try {
    const updated = mergedLocation(existing, payload);
    assertCoordinateFieldsValid(updated);
    locations[locationId] = updated;
    await saveSantaRouteToJson(locations);
    return { status: 200, body: { message: "Location updated successfully" } };
  } catch {
    return badRequest(INVALID_DATA_MESSAGE);
  }
}

function isValidIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

function mergedLocation(existing: LocationEntry, payload: Record<string, unknown>): LocationEntry {
  const notes = pickUpdatedNotes(existing, payload);
  const updated: LocationEntry = {
    ...existing,
    name: orFallback(payload.name, existing.name),
    latitude: numericOrFallback(payload.latitude, existing.latitude),
    longitude: numericOrFallback(payload.longitude, existing.longitude),
    utc_offset: numericOrFallback(payload.utc_offset, existing.utc_offset),
    arrival_time: orFallback(payload.arrival_time, existing.arrival_time),
    departure_time: orFallback(payload.departure_time, existing.departure_time),
    country: orFallback(payload.country, existing.country),
    population: orFallback(payload.population, existing.population),
    priority: orFallback(payload.priority, existing.priority),
    notes,
    fun_facts: notes,
    stop_duration: orFallback(payload.stop_duration, existing.stop_duration),
    is_stop: orFallback(payload.is_stop, existing.is_stop),
  };
  updated.lat = Number(updated.latitude);
  updated.lng = Number(updated.longitude);
  updated.timezone_offset = Number(updated.utc_offset);
  return updated;
}

function pickUpdatedNotes(existing: LocationEntry, payload: Record<string, unknown>): LocationEntry["notes"] {
  if ("notes" in payload) return payload.notes as LocationEntry["notes"];
  if ("fun_facts" in payload) return payload.fun_facts as LocationEntry["notes"];
  return existing.notes;
}

function orFallback<T>(value: unknown, fallback: T): T {
  return (value ?? fallback) as T;
}

function numericOrFallback(value: unknown, fallback: number | null | undefined): number | null | undefined {
  if (value == null) return fallback;
  return Number(value);
}

function assertCoordinateFieldsValid(updated: LocationEntry): void {
  for (const { pick, range } of LOCATION_FIELD_RANGES) {
    assertWithinRange(pick(updated), range);
  }
}

const LOCATION_FIELD_RANGES: { pick: (location: LocationEntry) => number | null | undefined; range: NumericRange }[] = [
  { pick: location => location.latitude, range: LATITUDE_RANGE },
  { pick: location => location.longitude, range: LONGITUDE_RANGE },
  { pick: location => location.utc_offset, range: UTC_OFFSET_RANGE },
];

function assertWithinRange(value: number | null | undefined, range: NumericRange): void {
  if (value == null) return;
  const numeric = Number(value);
  if (Number.isNaN(numeric) || isOutside(range, numeric)) {
    throw new RangeError(`value outside ${range.min}..${range.max}`);
  }
}

export async function deleteLocation(locationId: number): Promise<AdminApiResult> {
  try {
    return await removeLocation(locationId);
  } catch (error) {
    return notFoundAwareError(error, NOT_FOUND_BODY);
  }
}

async function removeLocation(locationId: number): Promise<AdminApiResult> {
  const locations = await loadSantaRouteFromJson();
  const existing = locations[locationId];
  if (!existing || !isValidIndex(locationId, locations.length)) {
    return { status: 404, body: { error: "Location not found" } };
  }
  locations.splice(locationId, 1);
  await saveSantaRouteToJson(locations);
  return {
    status: 200,
    body: { message: "Location deleted successfully", deleted_location: existing.name },
  };
}

interface ImportAccumulator {
  imported: LocationEntry[];
  errors: string[];
}

const IMPORT_INVALID_MESSAGE = "Invalid data";

export async function importLocations(payload: unknown): Promise<AdminApiResult> {
  try {
    return await importLocationPayloads(payload);
  } catch (error) {
    return notFoundAwareError(error, NOT_FOUND_BODY);
  }
}

async function importLocationPayloads(payload: unknown): Promise<AdminApiResult> {
  if (!isRecord(payload)) return badRequest("No data provided");
  const mode = payload.mode ?? "append";
  const entries = payload.locations;
  if (!Array.isArray(entries)) return badRequest("Locations must be a list");
  if (entries.length === 0) return badRequest("No locations provided");

  const acc: ImportAccumulator = { imported: [], errors: [] };
  entries.forEach((entry, index) => collectImportEntry(entry, index, acc));
  if (acc.errors.length > 0 && acc.imported.length === 0) {
    return { status: 400, body: { error: "No valid locations to import", details: acc.errors } };
  }

  const target = await resolveImportTarget(mode, acc.imported);
  await saveSantaRouteToJson(target);
  return {
    status: 200,
    body: {
      message: `Successfully imported ${acc.imported.length} location(s)`,
      imported: acc.imported.length,
      errors: acc.errors.length > 0 ? acc.errors : null,
      mode,
    },
  };
}

async function resolveImportTarget(mode: unknown, imported: LocationEntry[]): Promise<LocationEntry[]> {
  if (mode === "replace") return imported;
  const existing = await loadSantaRouteFromJson();
  return [...existing, ...imported];
}

function collectImportEntry(entry: unknown, index: number, acc: ImportAccumulator): void {
  const error = importEntryError(entry, index);
  if (error) {
    acc.errors.push(error);
    return;
  }
  try {
    acc.imported.push(createLocationFromPayload(entry as Record<string, unknown>));
  } catch {
    acc.errors.push(indexedImportMessage(index, IMPORT_INVALID_MESSAGE));
  }
}

interface ImportAlias {
  name: unknown;
  latitude: unknown;
  longitude: unknown;
  utc_offset: unknown;
}

const IMPORT_COORD_SPECS: { field: keyof ImportAlias; label: string; range: NumericRange }[] = [
  { field: "latitude", label: "latitude", range: LATITUDE_RANGE },
  { field: "longitude", label: "longitude", range: LONGITUDE_RANGE },
  { field: "utc_offset", label: "utc_offset", range: UTC_OFFSET_RANGE },
];

function importEntryError(entry: unknown, index: number): string | null {
  if (!isRecord(entry)) return indexedImportMessage(index, IMPORT_INVALID_MESSAGE);
  const alias: ImportAlias = {
    name: entry.name ?? entry.location,
    latitude: entry.latitude ?? entry.lat,
    longitude: entry.longitude ?? entry.lng,
    utc_offset: entry.utc_offset ?? entry.timezone_offset,
  };
  if (!alias.name) {
    return indexedImportMessage(index, "Missing required field 'name' or 'location'");
  }
  const missing = IMPORT_COORD_SPECS.filter(spec => alias[spec.field] == null).map(spec => spec.label);
  if (missing.length > 0) {
    return indexedImportMessage(index, `Missing required field(s): ${missing.join(", ")}`);
  }
  return importRangeError(alias, index);
}

function importRangeError(alias: ImportAlias, index: number): string | null {
  const numeric = IMPORT_COORD_SPECS.map(spec => ({ spec, value: Number(alias[spec.field]) }));
  if (numeric.some(({ value }) => Number.isNaN(value))) {
    return indexedImportMessage(index, IMPORT_INVALID_MESSAGE);
  }
  const invalid = numeric.find(({ spec, value }) => isOutside(spec.range, value));
  if (invalid) return indexedImportMessage(index, `Invalid ${invalid.spec.label}`);
  return null;
}

function indexedImportMessage(index: number, message: string): string {
  return `Location at index ${index}: ${message}`;
}

export async function validateStoredLocations(): Promise<AdminApiResult> {
  try {
    const locations = await loadSantaRouteFromJson();
    return { status: 200, body: validateLocations(locations) };
  } catch (error) {
    return notFoundAwareError(error, NOT_FOUND_BODY);
  }
}

export async function exportBackup(): Promise<AdminApiResult> {
  try {
    const locations = await loadSantaRouteFromJson();
    return {
      status: 200,
      body: {
        backup_timestamp: new Date().toISOString(),
        total_locations: locations.length,
        route: locations.map(serializeLocationFields),
      },
    };
  } catch (error) {
    return notFoundAwareError(error, { error: "Route data not found" });
  }
}
