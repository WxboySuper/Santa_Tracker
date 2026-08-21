import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getSantaRoutePath, getTrialRoutePath } from "./config";

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

// Helpers mirroring locations.py coercion
function safeFloat(v: any): number | null {
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
  return ((lng + 180) % 360) - 180;
}

function parseLocationNode(entry: any, idx: number): RouteNode | null {
  if (!entry || typeof entry !== "object") return null;
  // detect legacy flat schema
  if (!("location" in entry) && !("id" in entry) && ("latitude" in entry || "longitude" in entry || "name" in entry)) {
    const lat = entry.latitude ?? entry.lat;
    const lng = entry.longitude ?? entry.lng;
    const tz = entry.utc_offset ?? entry.timezone_offset;
    entry = {
      id: entry.name || `node_${idx}`,
      location: { name: entry.name, lat, lng, timezone_offset: tz },
      schedule: { arrival_utc: entry.arrival_time, departure_utc: entry.departure_time },
      stop_experience: { duration_seconds: entry.stop_duration != null ? entry.stop_duration * 60 : null },
      notes: entry.notes ?? entry.fun_facts,
      priority: entry.priority,
    };
  }

  const loc = entry.location;
  if (!loc || typeof loc !== "object") return null;
  const id = entry.id;
  if (!id) return null;
  const lat = safeFloat(loc.lat);
  const lng = safeFloat(loc.lng);
  if (lat == null || lng == null) return null;
  const tz = safeFloat(loc.timezone_offset);

  const stop = entry.stop_experience || {};
  const schedule = entry.schedule || {};
  const transit = entry.transit_to_here;

  let parsedTransit: TransitToHere | null = null;
  if (transit && typeof transit === "object") {
    parsedTransit = {
      description: transit.description ?? null,
      duration_seconds: transit.duration_seconds != null ? Number(transit.duration_seconds) : null,
      distance_km: transit.distance_km != null ? Number(transit.distance_km) : null,
      speed_curve: transit.speed_curve ?? null,
      speed_kmh: transit.speed_kmh != null ? Number(transit.speed_kmh) : null,
      camera_zoom: transit.camera_zoom != null ? Number(transit.camera_zoom) : null,
    };
  }

  return {
    id,
    type: entry.type ?? "DELIVERY",
    comment: entry.comment ?? null,
    location: {
      name: loc.name ?? id,
      region: loc.region ?? null,
      lat: lat!,
      lng: normalizeLng(lng!),
      timezone_offset: tz,
    },
    stop_experience: {
      duration_seconds: stop.duration_seconds != null ? Number(stop.duration_seconds) : 0,
      camera_zoom: stop.camera_zoom ?? null,
      weather_condition: stop.weather_condition ?? null,
      presents_delivered_at_stop: stop.presents_delivered_at_stop != null ? Number(stop.presents_delivered_at_stop) : 0,
    },
    schedule: {
      arrival_utc: schedule.arrival_utc ?? null,
      departure_utc: schedule.departure_utc ?? null,
      local_arrival_time: schedule.local_arrival_time ?? null,
      time_window_status: schedule.time_window_status ?? null,
    },
    transit_to_here: parsedTransit,
    notes: entry.notes ?? entry.fun_facts ?? null,
    priority: entry.priority ?? null,
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

function coerceNodeToFlat(item: any): Record<string, any> {
  // handles both RouteNode and flat legacy
  if (item && typeof item === "object" && "location" in item) {
    const node = item as RouteNode;
    const loc = node.location;
    const sched = node.schedule || {};
    const stop = node.stop_experience || {};
    const flat: Record<string, any> = {};
    flat.name = loc.name;
    flat.latitude = loc.lat;
    flat.longitude = loc.lng;
    flat.utc_offset = loc.timezone_offset;
    flat.arrival_time = sched.arrival_utc ?? null;
    flat.departure_time = sched.departure_utc ?? null;
    flat.country = loc.region ?? null;
    flat.priority = node.priority ?? null;
    if (node.notes != null) { flat.notes = node.notes; flat.fun_facts = node.notes; }
    if (stop.duration_seconds != null) flat.stop_duration = Math.round(Number(stop.duration_seconds) / 60);
    flat.is_stop = true;
    return flat;
  }
  // assume already flat
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

async function atomicWrite(filePath: string, data: any) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, filePath);
  // versioned snapshot: keep last 5 versions for rollback
  try {
    const backupDir = path.join(dir, ".history");
    await fs.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `${path.basename(filePath, ".json")}-${stamp}.json`);
    await fs.writeFile(backupPath, JSON.stringify(data, null, 2), "utf-8");
    const files = (await fs.readdir(backupDir)).filter(f => f.startsWith(path.basename(filePath, ".json"))).sort().reverse();
    for (const f of files.slice(5)) await fs.unlink(path.join(backupDir, f)).catch(() => {});
  } catch {}
}

export async function loadSantaRouteFromJson(source?: string | Record<string, any> | any[]): Promise<LocationEntry[]> {
  let obj: any;
  let fromFile = false;
  if (!source) {
    const defaultPath = getSantaRoutePath();
    if (!fsSync.existsSync(defaultPath)) throw new Error(`Route file not found: ${defaultPath}`);
    const content = await fs.readFile(defaultPath, "utf-8");
    obj = JSON.parse(content);
    fromFile = true;
  } else if (typeof source === "string") {
    if (fsSync.existsSync(source)) {
      const content = await fs.readFile(source, "utf-8");
      obj = JSON.parse(content);
      fromFile = true;
    } else {
      obj = JSON.parse(source);
    }
  } else {
    obj = source;
  }

  let nodes: any[] = [];
  if (Array.isArray(obj)) nodes = obj;
  else if (obj && typeof obj === "object") {
    nodes = obj.route_nodes ?? obj.route ?? obj.nodes ?? obj.stops ?? [];
  }

  const parsed: RouteNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    try {
      const p = parseLocationNode(nodes[i], i);
      if (p) parsed.push(p);
    } catch {}
  }

  // if source is undefined (legacy Flask admin reads), return LocationEntry[]
  // Mirror Python: source === undefined => Locations; explicit source => parsed nodes without legacy fields
  if (source == null) {
    return parsed.map(toLocationFromNode);
  }
  // For explicit source, strip legacy top-level fields like notes/priority? but keep for file-backed parity
  return parsed.map(toLocationFromNode);
}

export async function loadRouteNodesRaw(): Promise<RouteNode[]> {
  const defaultPath = getSantaRoutePath();
  const content = await fs.readFile(defaultPath, "utf-8");
  const obj = JSON.parse(content);
  const nodes = obj.route_nodes ?? obj.route ?? obj.nodes ?? [];
  const parsed: RouteNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const p = parseLocationNode(nodes[i], i);
    if (p) parsed.push(p);
  }
  return parsed;
}

export async function saveSantaRouteToJson(locations: (LocationEntry | RouteNode | Record<string, any>)[], filePath?: string) {
  const target = filePath ?? getSantaRoutePath();
  // Build route_nodes format for storage (preserve rich structure if nodes available)
  // If locations are LocationEntry (flattened), we need to convert to nodes or flat route array
  // For parity with Flask's save_santa_route_to_json which writes {"route": flat[]}, we support both:
  // If target is the main route file, write as {meta, route_nodes}
  // Detect by checking if original file had route_nodes
  let isLegacyFlat = false;
  try {
    const existing = JSON.parse(await fs.readFile(target, "utf-8"));
    if (existing.route && !existing.route_nodes) isLegacyFlat = true;
  } catch {}

  if (isLegacyFlat) {
    const route = locations.map(coerceNodeToFlat);
    await atomicWrite(target, { route });
  } else {
    // Write as route_nodes with full structure — convert flat entries to nodes
    const nodes: RouteNode[] = locations.map((item: any, idx: number) => {
      if (item.location && item.id) return item as RouteNode;
      // flat LocationEntry -> RouteNode
      const lat = item.latitude ?? item.lat;
      const lng = item.longitude ?? item.lng;
      const tz = item.utc_offset ?? item.timezone_offset ?? 0;
      return {
        id: item.id ?? `node_${idx}_${(item.name || "unknown").toLowerCase().replace(/\s+/g, "_")}`,
        type: item.type ?? "DELIVERY",
        comment: item.comment ?? null,
        location: {
          name: item.name,
          region: item.country ?? item.region ?? null,
          lat: Number(lat),
          lng: normalizeLng(Number(lng)),
          timezone_offset: Number(tz),
        },
        schedule: {
          arrival_utc: item.arrival_time ?? null,
          departure_utc: item.departure_time ?? null,
          local_arrival_time: null,
          time_window_status: null,
        },
        stop_experience: {
          duration_seconds: item.stop_duration != null ? Number(item.stop_duration) * 60 : 0,
          camera_zoom: null,
          weather_condition: null,
          presents_delivered_at_stop: 0,
        },
        transit_to_here: null,
        notes: item.notes ?? item.fun_facts ?? null,
        priority: item.priority ?? null,
      };
    });
    // Preserve meta if exists
    let meta: any = { year: 2025, route_version: "1.0", generated_at: new Date().toISOString() };
    try {
      const existing = JSON.parse(await fs.readFile(target, "utf-8"));
      if (existing.meta) meta = existing.meta;
    } catch {}
    await atomicWrite(target, { meta, route_nodes: nodes });
  }
}

export async function loadTrialRouteFromJson(): Promise<LocationEntry[] | null> {
  const p = getTrialRoutePath();
  if (!fsSync.existsSync(p)) return null;
  return loadSantaRouteFromJson(p);
}

export async function saveTrialRouteToJson(locations: (LocationEntry | RouteNode | Record<string, any>)[]) {
  const p = getTrialRoutePath();
  await saveSantaRouteToJson(locations, p);
}

export async function deleteTrialRoute(): Promise<boolean> {
  const p = getTrialRoutePath();
  if (fsSync.existsSync(p)) {
    await fs.unlink(p);
    return true;
  }
  return false;
}

export function hasTrialRoute(): boolean {
  return fsSync.existsSync(getTrialRoutePath());
}

export function createLocationFromPayload(data: Record<string, any>): LocationEntry {
  if (!data || typeof data !== "object") throw new Error("payload must be a dict");
  const name = data.name ?? data.location;
  if (!name) throw new Error("Missing required field: name");
  const latRaw = data.latitude ?? data.lat;
  const lngRaw = data.longitude ?? data.lng;
  const tzRaw = data.utc_offset ?? data.timezone_offset;
  if (latRaw == null || lngRaw == null || tzRaw == null) throw new Error("Missing required coordinate fields");
  const lat = Number(latRaw);
  const lngRawNum = Number(lngRaw);
  const tz = Number(tzRaw);
  if (Number.isNaN(lat) || lat < -90 || lat > 90) throw new Error(`Invalid latitude: ${latRaw}`);
  if (Number.isNaN(lngRawNum)) throw new Error(`Invalid longitude: ${lngRaw}`);
  // Normalize lng to [-180,180] like Python _location_validate_and_normalize_coords
  const lng = normalizeLng(lngRawNum);
  if (Number.isNaN(tz) || tz < -12 || tz > 14) throw new Error(`Invalid timezone_offset: ${tzRaw}`);
  if (data.priority != null && (!Number.isInteger(data.priority) || data.priority < 1 || data.priority > 3)) throw new Error(`Invalid priority: ${data.priority}`);
  const notes = data.notes ?? data.fun_facts ?? null;
  return {
    name,
    latitude: lat,
    longitude: lng,
    utc_offset: tz,
    lat,
    lng,
    timezone_offset: tz,
    arrival_time: data.arrival_time ?? null,
    departure_time: data.departure_time ?? null,
    country: data.country ?? null,
    population: data.population ?? null,
    priority: data.priority ?? null,
    notes,
    fun_facts: notes,
    stop_duration: data.stop_duration ?? null,
    is_stop: data.is_stop ?? true,
    region: data.region ?? data.country ?? null,
  };
}

export function validateLocations(locations: (LocationEntry | RouteNode | Record<string, any>)[]): { valid: boolean; total_locations: number; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenNames = new Map<string, number>();
  const seenCoords = new Map<string, number>();

  const extract = (item: any): { name: string | null; lat: any; lng: any; tz: any } => {
    if (item && typeof item === "object" && "location" in item && item.location) {
      return {
        name: item.location.name ?? item.id ?? item.name ?? null,
        lat: item.location.lat,
        lng: item.location.lng,
        tz: item.location.timezone_offset,
      };
    }
    return {
      name: item.name ?? item.id ?? null,
      lat: item.lat ?? item.latitude ?? null,
      lng: item.lng ?? item.longitude ?? null,
      tz: item.timezone_offset ?? item.utc_offset ?? null,
    };
  };

  for (let idx = 0; idx < locations.length; idx++) {
    const item = locations[idx];
    try {
      const info = extract(item);
      const name = info.name || `(index ${idx})`;
      if (seenNames.has(name)) {
        errors.push(`Duplicate location name '${name}' at indices ${seenNames.get(name)} and ${idx}`);
      } else seenNames.set(name, idx);

      const latf = info.lat != null ? Number(info.lat) : null;
      const lngf = info.lng != null ? Number(info.lng) : null;
      const tzf = info.tz != null ? Number(info.tz) : null;

      if (latf == null || Number.isNaN(latf)) errors.push(`Invalid latitude for '${name}' (index ${idx}): ${info.lat}`);
      if (lngf == null || Number.isNaN(lngf)) errors.push(`Invalid longitude for '${name}' (index ${idx}): ${info.lng}`);
      if (tzf != null && Number.isNaN(tzf)) errors.push(`Invalid UTC offset for '${name}' (index ${idx}): ${info.tz}`);

      if (latf != null && !Number.isNaN(latf) && (latf < -90 || latf > 90)) errors.push(`Invalid latitude for '${name}' (index ${idx}): ${latf}`);
      if (lngf != null && !Number.isNaN(lngf) && (lngf < -180 || lngf > 180)) errors.push(`Invalid longitude for '${name}' (index ${idx}): ${lngf}`);
      if (tzf != null && !Number.isNaN(tzf) && (tzf < -12 || tzf > 14)) errors.push(`Invalid UTC offset for '${name}' (index ${idx}): ${tzf}`);

      if (latf != null && lngf != null && !Number.isNaN(latf) && !Number.isNaN(lngf)) {
        const key = `${Math.round(latf * 10000) / 10000},${Math.round(lngf * 10000) / 10000}`;
        if (seenCoords.has(key)) {
          const otherIdx = seenCoords.get(key)!;
          const other: any = locations[otherIdx];
          const otherName = other?.name ?? other?.id ?? other?.location?.name ?? `(index ${otherIdx})`;
          warnings.push(`Very close coordinates for '${name}' (index ${idx}) and '${otherName}' (index ${otherIdx})`);
        } else seenCoords.set(key, idx);
      }

      if (tzf != null && !Number.isNaN(tzf)) {
        const frac = Math.abs(tzf % 1);
        if (![0, 0.25, 0.5, 0.75].some(a => Math.abs(frac - a) < 1e-9)) {
          warnings.push(`Unusual UTC offset for '${name}': ${tzf}`);
        }
      }
    } catch (e: any) {
      errors.push(`error processing location at index ${idx}: ${e.message}`);
    }
  }

  return { valid: errors.length === 0, total_locations: locations.length, errors, warnings };
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
    const p = getSantaRoutePath();
    const stat = fsSync.statSync(p);
    last_modified = stat.mtime.toString();
  } catch {}
  return {
    total_locations,
    locations_with_timing,
    priority_breakdown,
    last_modified,
    route_complete: locations_with_timing === total_locations && total_locations > 0,
  };
}
