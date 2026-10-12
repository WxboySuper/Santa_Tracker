import fs from "fs/promises";
import path from "path";
import { getSantaRoutePath, getTrialRoutePath } from "./config";
import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import { getSnapshotStore } from "./storage";
import { ensureStoreBootstrapped, persistSantaRoute, persistTrialRoute, removeTrialRoute } from "./storage/publish";
import { DATASET_SANTA_ROUTE, DATASET_TRIAL_ROUTE } from "./storage/types";

export interface StopExperience {
  duration_seconds?: number | null;
  camera_zoom?: number | null;
  weather_condition?: string | null;
  presents_delivered_at_stop?: number | null;
}

export interface TransitToHere {
  description?: string | null;
  duration_seconds?: number | null;
  distance_km?: number | null;
  speed_curve?: string | null;
  speed_kmh?: number | null;
  camera_zoom?: number | null;
}

export interface Schedule {
  arrival_utc?: string | null;
  departure_utc?: string | null;
  local_arrival_time?: string | null;
  time_window_status?: string | null;
}

export interface LocationEntry {
  name: string;
  region?: string | null;
  lat?: number | null;
  lng?: number | null;
  timezone_offset?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  utc_offset?: number | null;
  arrival_time?: string | null;
  departure_time?: string | null;
  stop_duration?: number | null;
  is_stop?: boolean | null;
  priority?: number | null;
  notes?: string | null;
  fun_facts?: string | null;
  country?: string | null;
  population?: number | null;
  type?: string | null;
  id?: string | null;
}

export interface RouteNode {
  comment?: string | null;
  id: string;
  type: string;
  location: {
    name: string;
    region?: string | null;
    lat: number;
    lng: number;
    timezone_offset?: number | null;
  };
  stop_experience?: StopExperience | null;
  schedule?: Schedule | null;
  transit_to_here?: TransitToHere | null;
  notes?: string | null;
  priority?: number | null;
}

type JsonRecord = Record<string, unknown>;
type LocationInput = LocationEntry | RouteNode | JsonRecord;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecord(value: LocationInput): JsonRecord {
  return value as unknown as JsonRecord;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalNumber(value: unknown): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

// Helpers mirroring locations.py coercion
function safeFloat(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.replace(/,/g, "").trim();
    const n = Number(s);
    if (Number.isNaN(n)) throw new Error(`expected numeric string got ${v}`);
    return n;
  }
  throw new Error(`unsupported type`);
}

function normalizeLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function isLegacyLocation(entry: JsonRecord): boolean {
  return !entry.location && !entry.id && ("latitude" in entry || "longitude" in entry || "name" in entry);
}

function normalizeLegacyLocation(entry: JsonRecord, idx: number): JsonRecord {
  const lat = entry.latitude ?? entry.lat;
  const lng = entry.longitude ?? entry.lng;
  const tz = entry.utc_offset ?? entry.timezone_offset;
  return {
    id: entry.name || `node_${idx}`,
    location: { name: entry.name, lat, lng, timezone_offset: tz },
    schedule: { arrival_utc: entry.arrival_time, departure_utc: entry.departure_time },
    stop_experience: { duration_seconds: entry.stop_duration != null ? entry.stop_duration * 60 : null },
    notes: entry.notes ?? entry.fun_facts,
    priority: entry.priority,
  };
}

function parseTransit(value: unknown): TransitToHere | null {
  if (!isRecord(value)) return null;
  return {
    description: optionalString(value.description),
    duration_seconds: optionalNumber(value.duration_seconds),
    distance_km: optionalNumber(value.distance_km),
    speed_curve: optionalString(value.speed_curve),
    speed_kmh: optionalNumber(value.speed_kmh),
    camera_zoom: optionalNumber(value.camera_zoom),
  };
}

function parseLocationNode(value: unknown, idx: number): RouteNode | null {
  if (!isRecord(value)) return null;
  const entry = isLegacyLocation(value) ? normalizeLegacyLocation(value, idx) : value;

  const loc = entry.location;
  if (!isRecord(loc)) return null;
  const id = optionalString(entry.id);
  if (!id) return null;
  const lat = safeFloat(loc.lat);
  const lng = safeFloat(loc.lng);
  if (lat == null || lng == null) return null;
  const tz = safeFloat(loc.timezone_offset);

  const stop = isRecord(entry.stop_experience) ? entry.stop_experience : {};
  const schedule = isRecord(entry.schedule) ? entry.schedule : {};

  return {
    id,
    type: optionalString(entry.type) ?? "DELIVERY",
    comment: optionalString(entry.comment),
    location: {
      name: optionalString(loc.name) ?? id,
      region: optionalString(loc.region),
      lat: lat!,
      lng: normalizeLng(lng!),
      timezone_offset: tz,
    },
    stop_experience: {
      duration_seconds: optionalNumber(stop.duration_seconds) ?? 0,
      camera_zoom: optionalNumber(stop.camera_zoom),
      weather_condition: optionalString(stop.weather_condition),
      presents_delivered_at_stop: optionalNumber(stop.presents_delivered_at_stop) ?? 0,
    },
    schedule: {
      arrival_utc: optionalString(schedule.arrival_utc),
      departure_utc: optionalString(schedule.departure_utc),
      local_arrival_time: optionalString(schedule.local_arrival_time),
      time_window_status: optionalString(schedule.time_window_status),
    },
    transit_to_here: parseTransit(entry.transit_to_here),
    notes: optionalString(entry.notes) ?? optionalString(entry.fun_facts),
    priority: optionalNumber(entry.priority),
  };
}

function toLocationFromNode(node: RouteNode): LocationEntry {
  const loc = node.location;
  const sched = node.schedule || {};
  const stop = node.stop_experience || {};
  const tz = loc.timezone_offset ?? 0;
  const durationMin = stop.duration_seconds != null ? Math.round(Number(stop.duration_seconds) / 60) : null;
  return {
    name: loc.name,
    region: loc.region,
    lat: loc.lat,
    lng: loc.lng,
    timezone_offset: tz,
    latitude: loc.lat,
    longitude: loc.lng,
    utc_offset: tz,
    arrival_time: sched.arrival_utc ?? null,
    departure_time: sched.departure_utc ?? null,
    stop_duration: durationMin,
    is_stop: true,
    priority: node.priority ?? null,
    notes: node.notes ?? null,
    fun_facts: node.notes ?? null,
    country: loc.region ?? null,
    population: null,
    id: node.id,
    type: node.type,
  };
}

function isRouteNode(item: LocationInput): item is RouteNode {
  const record = toRecord(item);
  return typeof record.id === "string" && isRecord(record.location);
}

function coerceNodeToFlat(item: LocationInput): JsonRecord {
  return isRouteNode(item) ? flattenRouteNode(item) : flattenLegacyLocation(toRecord(item));
}

function flattenRouteNode(node: RouteNode): JsonRecord {
  const loc = node.location;
  const sched = node.schedule || {};
  const stop = node.stop_experience || {};
  const flat: JsonRecord = {
    name: loc.name,
    latitude: loc.lat,
    longitude: loc.lng,
    utc_offset: loc.timezone_offset,
    arrival_time: sched.arrival_utc ?? null,
    departure_time: sched.departure_utc ?? null,
    country: loc.region ?? null,
    priority: node.priority ?? null,
    is_stop: true,
  };
  if (node.notes != null) { flat.notes = node.notes; flat.fun_facts = node.notes; }
  if (stop.duration_seconds != null) flat.stop_duration = Math.round(Number(stop.duration_seconds) / 60);
  return flat;
}

function flattenLegacyLocation(item: JsonRecord): JsonRecord {
  return {
    name: item.name,
    latitude: Number(item.latitude ?? item.lat),
    longitude: Number(item.longitude ?? item.lng),
    utc_offset: Number(item.utc_offset ?? item.timezone_offset),
    arrival_time: item.arrival_time ?? null,
    departure_time: item.departure_time ?? null,
    country: item.country ?? item.region ?? null,
    population: item.population ?? null,
    priority: item.priority ?? null,
    notes: item.notes ?? item.fun_facts ?? null,
    fun_facts: item.notes ?? item.fun_facts ?? null,
    stop_duration: item.stop_duration ?? null,
    is_stop: item.is_stop ?? true,
  };
}

async function getRouteStore() {
  const store = getSnapshotStore(getSantaSnapshotsBucket());
  await ensureStoreBootstrapped(store);
  return store;
}

async function readPublishedSantaRouteJson(): Promise<string> {
  const store = await getRouteStore();
  const active = await store.readActive(DATASET_SANTA_ROUTE);
  if (!active) {
    const missing = new Error(`Route file not found: ${getSantaRoutePath()}`);
    missing.cause = "ENOENT";
    throw missing;
  }
  return active;
}

export async function loadSantaRouteFromJson(source?: string | JsonRecord | unknown[]): Promise<LocationEntry[]> {
  const obj = await readRouteSource(source);
  return parseRouteNodes(extractRouteNodes(obj)).map(toLocationFromNode);
}

async function readRouteSource(source?: string | JsonRecord | unknown[]): Promise<unknown> {
  if (!source) return JSON.parse(await readPublishedSantaRouteJson());
  if (typeof source !== "string") return source;
  try {
    return await readRouteFile(source, "Route file not found");
  } catch (error: unknown) {
    if (error instanceof Error && error.cause === "ENOENT") return JSON.parse(source);
    throw error;
  }
}

async function readRouteFile(filePath: string, errorLabel: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const missing = new Error(`${errorLabel}: ${filePath}`);
      missing.cause = "ENOENT";
      throw missing;
    }
    throw error;
  }
}

function extractRouteNodes(obj: unknown): unknown[] {
  if (Array.isArray(obj)) return obj;
  if (!isRecord(obj)) return [];
  const nodes = obj.route_nodes ?? obj.route ?? obj.nodes ?? obj.stops;
  return Array.isArray(nodes) ? nodes : [];
}

function parseRouteNodes(nodes: unknown[]): RouteNode[] {
  const parsed: RouteNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    try {
      const node = parseLocationNode(nodes[i], i);
      if (node) parsed.push(node);
    } catch {
      // Ignore malformed nodes to preserve the legacy loader behavior.
    }
  }
  return parsed;
}

export async function loadRouteNodesRaw(): Promise<RouteNode[]> {
  const obj: unknown = JSON.parse(await readPublishedSantaRouteJson());
  return parseRouteNodes(extractRouteNodes(obj));
}

function buildSantaRouteDocument(
  locations: LocationInput[],
  existingJson?: string,
): Record<string, unknown> {
  let isLegacyFlat = false;
  let meta: Record<string, unknown> = { year: 2025, route_version: "1.0", generated_at: new Date().toISOString() };
  if (existingJson) {
    try {
      const parsed: unknown = JSON.parse(existingJson);
      if (isRecord(parsed)) {
        if (parsed.route && !parsed.route_nodes) isLegacyFlat = true;
        if (isRecord(parsed.meta)) meta = parsed.meta;
      }
    } catch {
      // ignore parse errors
    }
  }

  if (isLegacyFlat) {
    return { route: locations.map(coerceNodeToFlat) };
  }

  const nodes: RouteNode[] = locations.map((input, idx) => {
    if (isRouteNode(input)) return input;
    const item = toRecord(input);
    const lat = item.latitude ?? item.lat;
    const lng = item.longitude ?? item.lng;
    const tz = item.utc_offset ?? item.timezone_offset ?? 0;
    const name = optionalString(item.name) ?? "";
    return {
      id: optionalString(item.id) ?? `node_${idx}_${(name || "unknown").toLowerCase().replace(/\s+/g, "_")}`,
      type: optionalString(item.type) ?? "DELIVERY",
      comment: optionalString(item.comment),
      location: {
        name,
        region: optionalString(item.country) ?? optionalString(item.region),
        lat: Number(lat),
        lng: normalizeLng(Number(lng)),
        timezone_offset: Number(tz),
      },
      schedule: {
        arrival_utc: optionalString(item.arrival_time),
        departure_utc: optionalString(item.departure_time),
        local_arrival_time: null,
        time_window_status: null,
      },
      stop_experience: {
        duration_seconds: optionalNumber(item.stop_duration) != null ? Number(item.stop_duration) * 60 : 0,
        camera_zoom: null,
        weather_condition: null,
        presents_delivered_at_stop: 0,
      },
      transit_to_here: null,
      notes: optionalString(item.notes) ?? optionalString(item.fun_facts),
      priority: optionalNumber(item.priority),
    };
  });
  return { meta, route_nodes: nodes };
}

export async function saveSantaRouteToJson(locations: LocationInput[], filePath?: string) {
  const target = filePath ?? getSantaRoutePath();
  const isMainRoute = path.resolve(target) === path.resolve(getSantaRoutePath());
  let existingJson: string | undefined;
  try {
    existingJson = isMainRoute ? await readPublishedSantaRouteJson() : await fs.readFile(target, "utf-8");
  } catch {
    existingJson = undefined;
  }
  const document = buildSantaRouteDocument(locations, existingJson);
  const body = JSON.stringify(document, null, 2);
  if (isMainRoute) {
    await persistSantaRoute(await getRouteStore(), body);
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, body, "utf-8");
  await fs.rename(tmp, target);
}

export async function loadTrialRouteFromJson(): Promise<LocationEntry[] | null> {
  const store = await getRouteStore();
  const active = await store.readActive(DATASET_TRIAL_ROUTE);
  if (!active) return null;
  return loadSantaRouteFromJson(JSON.parse(active) as Record<string, unknown>);
}

export async function saveTrialRouteToJson(locations: LocationInput[]) {
  const existing = await (async () => {
    try {
      return await readPublishedSantaRouteJson();
    } catch {
      return undefined;
    }
  })();
  const body = JSON.stringify(buildSantaRouteDocument(locations, existing), null, 2);
  await persistTrialRoute(await getRouteStore(), body);
}

export async function deleteTrialRoute(): Promise<boolean> {
  return removeTrialRoute(await getRouteStore());
}

export async function hasTrialRoute(): Promise<boolean> {
  const store = await getRouteStore();
  const active = await store.readActive(DATASET_TRIAL_ROUTE);
  return active != null;
}

export function createLocationFromPayload(data: JsonRecord): LocationEntry {
  const name = optionalString(data.name) ?? optionalString(data.location);
  if (!name) throw new Error("Missing required field: name");
  const { lat, lng, tz } = parseLocationCoordinates(data);
  validatePriority(data.priority);
  const notes = optionalString(data.notes) ?? optionalString(data.fun_facts);
  const priority = optionalNumber(data.priority);
  return {
    name,
    latitude: lat,
    longitude: lng,
    utc_offset: tz,
    lat,
    lng,
    timezone_offset: tz,
    arrival_time: optionalString(data.arrival_time),
    departure_time: optionalString(data.departure_time),
    country: optionalString(data.country),
    population: optionalNumber(data.population),
    priority,
    notes,
    fun_facts: notes,
    stop_duration: optionalNumber(data.stop_duration),
    is_stop: typeof data.is_stop === "boolean" ? data.is_stop : true,
    region: optionalString(data.region) ?? optionalString(data.country),
  };
}

function parseLocationCoordinates(data: JsonRecord): { lat: number; lng: number; tz: number } {
  const latRaw = data.latitude ?? data.lat;
  const lngRaw = data.longitude ?? data.lng;
  const tzRaw = data.utc_offset ?? data.timezone_offset;
  if (latRaw == null || lngRaw == null || tzRaw == null) throw new Error("Missing required coordinate fields");
  const lat = Number(latRaw);
  const longitude = Number(lngRaw);
  const tz = Number(tzRaw);
  validateLatitude(lat, latRaw);
  validateLongitude(longitude, lngRaw);
  validateTimezone(tz, tzRaw);
  return { lat, lng: normalizeLng(longitude), tz };
}

function validateLatitude(value: number, raw: unknown): void {
  if (Number.isNaN(value) || value < -90 || value > 90) throw new Error(`Invalid latitude: ${raw}`);
}

function validateLongitude(value: number, raw: unknown): void {
  if (Number.isNaN(value)) throw new Error(`Invalid longitude: ${raw}`);
}

function validateTimezone(value: number, raw: unknown): void {
  if (Number.isNaN(value) || value < -12 || value > 14) throw new Error(`Invalid timezone_offset: ${raw}`);
}

function validatePriority(priority: unknown): void {
  if (priority != null && (typeof priority !== "number" || !Number.isInteger(priority) || priority < 1 || priority > 3)) {
    throw new Error(`Invalid priority: ${priority}`);
  }
}

interface LocationValidationState {
  locations: LocationInput[];
  seenNames: Map<string, number>;
  seenCoords: Map<string, number>;
  errors: string[];
  warnings: string[];
}

export function validateLocations(locations: LocationInput[]): { valid: boolean; total_locations: number; errors: string[]; warnings: string[] } {
  const state: LocationValidationState = {
    locations,
    seenNames: new Map<string, number>(),
    seenCoords: new Map<string, number>(),
    errors: [],
    warnings: [],
  };

  locations.forEach((item, idx) => validateLocationSafely(item, idx, state));

  return { valid: state.errors.length === 0, total_locations: locations.length, errors: state.errors, warnings: state.warnings };
}

function validateLocationSafely(item: LocationInput, idx: number, state: LocationValidationState): void {
  try {
    validateLocation(item, idx, state);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    state.errors.push(`error processing location at index ${idx}: ${message}`);
  }
}

interface LocationInfo {
  name: string | null;
  lat: unknown;
  lng: unknown;
  tz: unknown;
}

function extractLocationInfo(input: LocationInput): LocationInfo {
  const item = toRecord(input);
  if (isRecord(item.location)) {
    const location = item.location;
    return {
      name: optionalString(location.name) ?? optionalString(item.id) ?? optionalString(item.name),
      lat: location.lat,
      lng: location.lng,
      tz: location.timezone_offset,
    };
  }
  return {
    name: optionalString(item.name) ?? optionalString(item.id),
    lat: item.lat ?? item.latitude ?? null,
    lng: item.lng ?? item.longitude ?? null,
    tz: item.timezone_offset ?? item.utc_offset ?? null,
  };
}

function validateLocation(item: LocationInput, idx: number, state: LocationValidationState): void {
  const info = extractLocationInfo(item);
  const name = info.name || `(index ${idx})`;
  checkDuplicateName(name, idx, state.seenNames, state.errors);
  const lat = toNumber(info.lat);
  const lng = toNumber(info.lng);
  const tz = toNumber(info.tz);
  addCoordinateErrors({ name, idx, info, lat, lng, tz, errors: state.errors });
  addCoordinateWarning(state.locations, name, idx, lat, lng, state.seenCoords, state.warnings);
  addTimezoneWarning(name, tz, state.warnings);
}

function toNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function checkDuplicateName(name: string, idx: number, seenNames: Map<string, number>, errors: string[]): void {
  const previous = seenNames.get(name);
  if (previous != null) errors.push(`Duplicate location name '${name}' at indices ${previous} and ${idx}`);
  else seenNames.set(name, idx);
}

interface CoordinateValidation {
  name: string;
  idx: number;
  raw: unknown;
  value: number | null;
  errors: string[];
}

function addCoordinateErrors(context: { name: string; idx: number; info: LocationInfo; lat: number | null; lng: number | null; tz: number | null; errors: string[] }): void {
  addLatitudeError({ ...context, raw: context.info.lat, value: context.lat });
  addLongitudeError({ ...context, raw: context.info.lng, value: context.lng });
  addTimezoneError({ ...context, raw: context.info.tz, value: context.tz });
}

function addLatitudeError({ name, idx, raw, value, errors }: CoordinateValidation): void {
  if (isInvalidCoordinate(value, -90, 90)) {
    errors.push(`Invalid latitude for '${name}' (index ${idx}): ${raw}`);
  }
}

function addLongitudeError({ name, idx, raw, value, errors }: CoordinateValidation): void {
  if (isInvalidCoordinate(value, -180, 180)) {
    errors.push(`Invalid longitude for '${name}' (index ${idx}): ${raw}`);
  }
}

function addTimezoneError({ name, idx, raw, value, errors }: CoordinateValidation): void {
  if (isInvalidOptionalCoordinate(value, -12, 14)) {
    errors.push(`Invalid UTC offset for '${name}' (index ${idx}): ${raw}`);
  }
}

function isInvalidCoordinate(value: number | null, min: number, max: number): boolean {
  if (value == null) return true;
  if (Number.isNaN(value)) return true;
  return isOutsideRange(value, min, max);
}

function isInvalidOptionalCoordinate(value: number | null, min: number, max: number): boolean {
  if (value == null) return false;
  return isInvalidCoordinate(value, min, max);
}

function isOutsideRange(value: number, min: number, max: number): boolean {
  if (value < min) return true;
  return value > max;
}

function addCoordinateWarning(locations: LocationInput[], name: string, idx: number, lat: number | null, lng: number | null, seenCoords: Map<string, number>, warnings: string[]): void {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return;
  const key = `${Math.round(lat * 10000) / 10000},${Math.round(lng * 10000) / 10000}`;
  const otherIdx = seenCoords.get(key);
  if (otherIdx != null) {
    const otherInput = locations[otherIdx];
    if (!otherInput) return;
    const other = toRecord(otherInput);
    const otherLocation = isRecord(other.location) ? other.location : null;
    const otherName = optionalString(other.name) ?? optionalString(other.id) ?? optionalString(otherLocation?.name) ?? `(index ${otherIdx})`;
    warnings.push(`Very close coordinates for '${name}' (index ${idx}) and '${otherName}' (index ${otherIdx})`);
  } else seenCoords.set(key, idx);
}

function addTimezoneWarning(name: string, tz: number | null, warnings: string[]): void {
  if (tz == null || Number.isNaN(tz)) return;
  const fraction = Math.abs(tz % 1);
  const validFraction = [0, 0.25, 0.5, 0.75].some(value => Math.abs(fraction - value) < 1e-9);
  if (!validFraction) warnings.push(`Unusual UTC offset for '${name}': ${tz}`);
}

export async function getRouteStatus() {
  const locations = await loadSantaRouteFromJson();
  const total_locations = locations.length;
  const locations_with_timing = locations.filter(l => l.arrival_time && l.departure_time).length;
  const priority_breakdown: Record<string, number> = {};
  for (const loc of locations) {
    if (loc.priority != null) {
      const k = String(loc.priority);
      priority_breakdown[k] = (priority_breakdown[k] || 0) + 1;
    }
  }
  let last_modified = "Unknown";
  try {
    const versions = await (await getRouteStore()).listVersions(DATASET_SANTA_ROUTE);
    if (versions[0]) last_modified = versions[0].createdAt;
  } catch {}
  return {
    total_locations,
    locations_with_timing,
    priority_breakdown,
    last_modified,
    route_complete: locations_with_timing === total_locations && total_locations > 0,
  };
}
