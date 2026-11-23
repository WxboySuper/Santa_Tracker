import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createFilesystemBackend } from "../../apps/web/src/lib/storage/filesystem-backend";
import { createVersionedSnapshotStore } from "../../apps/web/src/lib/storage/versioned-store-core";
import { DATASET_SANTA_ROUTE } from "../../apps/web/src/lib/storage/types";

export interface BackupLocation {
  name: string;
  latitude: number;
  longitude: number;
  utc_offset: number;
  arrival_time?: string | null;
  departure_time?: string | null;
  country?: string | null;
  population?: number | null;
  priority?: number | null;
  notes?: string | null;
  fun_facts?: string | null;
  stop_duration?: number | null;
  is_stop?: boolean | null;
}

export interface RouteBackupExport {
  backup_timestamp: string;
  total_locations: number;
  route: BackupLocation[];
}

export function parseRouteBackupExport(raw: string): RouteBackupExport {
  const value = parseBackupJson(raw);
  assertBackupEnvelope(value);
  const route = value.route.map((item, index) => parseLocation(item, index));
  return { backup_timestamp: value.backup_timestamp, total_locations: route.length, route };
}

function parseBackupJson(raw: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Backup file must contain valid JSON");
  }
  if (!isRecord(value)) throw new Error("Backup file must be an admin route export");
  return value;
}

function assertBackupEnvelope(value: Record<string, unknown>): asserts value is Record<string, unknown> & {
  backup_timestamp: string;
  total_locations: number;
  route: unknown[];
} {
  if (typeof value.backup_timestamp !== "string") throw new Error("Backup file must be an admin route export");
  if (!Array.isArray(value.route)) throw new Error("Backup file must be an admin route export");
  if (value.total_locations !== value.route.length) throw new Error("Backup total_locations must match the route");
  if (value.route.length === 0) throw new Error("Backup route must not be empty");
}

function parseLocation(value: unknown, index: number): BackupLocation {
  if (!isRecord(value)) throw new Error(`Backup route item ${index} must be an object`);
  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new Error(`Backup route item ${index} needs a name`);
  }
  const latitude = requiredNumber(value.latitude, index, "latitude", { min: -90, max: 90 });
  const longitude = normalizeLongitude(finiteNumber(value.longitude, index, "longitude"));
  const utcOffset = requiredNumber(value.utc_offset, index, "utc_offset", { min: -12, max: 14 });
  validateOptionalFields(value, index);
  return {
    name: value.name,
    latitude,
    longitude,
    utc_offset: utcOffset,
    arrival_time: optionalString(value.arrival_time),
    departure_time: optionalString(value.departure_time),
    country: optionalString(value.country),
    population: optionalNumber(value.population),
    priority: optionalNumber(value.priority),
    notes: optionalString(value.notes),
    fun_facts: optionalString(value.fun_facts),
    stop_duration: optionalNumber(value.stop_duration),
    is_stop: typeof value.is_stop === "boolean" ? value.is_stop : true,
  };
}

function validateOptionalFields(value: Record<string, unknown>, index: number): void {
  validateOptionalStrings(value, index);
  validateOptionalNumbers(value, index);
  if (value.is_stop != null && typeof value.is_stop !== "boolean") {
    throw new Error(`Backup route item ${index} has invalid is_stop`);
  }
}

function validateOptionalStrings(value: Record<string, unknown>, index: number): void {
  const fields = ["arrival_time", "departure_time", "country", "notes", "fun_facts"] as const;
  for (const field of fields) {
    if (value[field] != null && typeof value[field] !== "string") {
      throw new Error(`Backup route item ${index} has invalid ${field}`);
    }
  }
}

function validateOptionalNumbers(value: Record<string, unknown>, index: number): void {
  const fields = ["population", "priority", "stop_duration"] as const;
  for (const field of fields) {
    const candidate = value[field];
    if (candidate == null) continue;
    if (typeof candidate !== "number") throw new Error(`Backup route item ${index} has invalid ${field}`);
    if (!Number.isFinite(candidate)) throw new Error(`Backup route item ${index} has invalid ${field}`);
    if (candidate < 0) throw new Error(`Backup route item ${index} has invalid ${field}`);
    if (field === "priority" && (!Number.isInteger(candidate) || candidate > 3)) {
      throw new Error(`Backup route item ${index} has invalid ${field}`);
    }
  }
}

function finiteNumber(value: unknown, index: number, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Backup route item ${index} has invalid ${field}`);
  }
  return value;
}

function normalizeLongitude(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function requiredNumber(value: unknown, index: number, field: string, range: { min: number; max: number }): number {
  if (typeof value !== "number") throw new Error(`Backup route item ${index} has invalid ${field}`);
  if (!Number.isFinite(value)) throw new Error(`Backup route item ${index} has invalid ${field}`);
  if (value < range.min || value > range.max) throw new Error(`Backup route item ${index} has invalid ${field}`);
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function backupToRouteDocument(backup: RouteBackupExport): Record<string, unknown> {
  return {
    meta: { year: 2026, route_version: "restored-from-admin-backup", generated_at: backup.backup_timestamp },
    route_nodes: backup.route.map((location, index) => ({
      id: `backup-${index + 1}`,
      type: location.is_stop === false ? "FLYOVER" : "DELIVERY",
      is_stop: location.is_stop ?? true,
      location: {
        name: location.name,
        lat: location.latitude,
        lng: location.longitude,
        timezone_offset: location.utc_offset,
        region: location.country ?? null,
      },
      schedule: {
        arrival_utc: location.arrival_time ?? null,
        departure_utc: location.departure_time ?? null,
      },
      stop_experience: { duration_seconds: location.is_stop === false ? 0 : (location.stop_duration ?? 0) * 60 },
      notes: location.notes ?? location.fun_facts ?? null,
      priority: location.priority ?? null,
    })),
  };
}

export async function restoreBackupFile(inputPath: string, dataDir: string): Promise<{ versionId: string; locationCount: number }> {
  if (!inputPath || !dataDir) throw new Error("Pass both --input and --data-dir");
  const root = path.resolve(dataDir);
  const backup = parseRouteBackupExport(await readFile(path.resolve(inputPath), "utf8"));
  const store = createVersionedSnapshotStore(createFilesystemBackend(root));
  if (await store.readActive(DATASET_SANTA_ROUTE)) {
    throw new Error(`Refusing to restore over an active route in ${root}; use an empty local data directory`);
  }
  const version = await store.saveNewVersion(DATASET_SANTA_ROUTE, JSON.stringify(backupToRouteDocument(backup), null, 2));
  await store.activateVersion(DATASET_SANTA_ROUTE, version.versionId);
  return { versionId: version.versionId, locationCount: backup.total_locations };
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
  return value;
}

function isCliEntry(): boolean {
  const script = process.argv[1];
  return Boolean(script && import.meta.url === pathToFileURL(path.resolve(script)).href);
}

if (isCliEntry()) {
  try {
    const input = readOption(process.argv.slice(2), "--input");
    const dataDir = readOption(process.argv.slice(2), "--data-dir");
    if (!input || !dataDir) throw new Error("Usage: pnpm exec tsx tools/rehearsal/restore-backup.ts --input <export.json> --data-dir <empty-local-dir>");
    const result = await restoreBackupFile(input, dataDir);
    console.log(`RESTORED local filesystem route locations=${result.locationCount} version=${result.versionId} data-dir=${path.resolve(dataDir)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
