import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LegacyRouteFixtureSchema } from "../../packages/contracts/src/schemas";
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

interface ValueAtIndex {
  value: unknown;
  index: number;
}

interface FieldAtIndex extends ValueAtIndex {
  field: string;
}

export function parseRouteBackupExport({ raw }: { raw: string }): RouteBackupExport {
  const value = parseBackupJson({ raw });
  const envelope = assertBackupEnvelope({ value });
  const route = envelope.route.map((item, index) => parseLocation({ value: item, index }));
  return { backup_timestamp: envelope.backup_timestamp, total_locations: route.length, route };
}

function parseBackupJson({ raw }: { raw: string }): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Backup file must contain valid JSON");
  }
  const record = asRecord({ value });
  if (!record) throw new Error("Backup file must be an admin route export");
  return record;
}

function assertBackupEnvelope({ value }: { value: Record<string, unknown> }): Record<string, unknown> & {
  backup_timestamp: string;
  total_locations: number;
  route: unknown[];
} {
  assertBackupTimestamp({ value });
  const route = assertBackupRoute({ value });
  assertLocationCount({ value, actualCount: route.length });
  assertRouteHasLocations({ route });
  return value as Record<string, unknown> & { backup_timestamp: string; total_locations: number; route: unknown[] };
}

function assertBackupTimestamp({ value }: { value: Record<string, unknown> }): void {
  const timestamp = LegacyRouteFixtureSchema.shape.meta.shape.generated_at.safeParse(value.backup_timestamp);
  if (!timestamp.success) throw new Error("Backup file must be an admin route export with a valid ISO timestamp");
}

function assertBackupRoute({ value }: { value: Record<string, unknown> }): unknown[] {
  if (!Array.isArray(value.route)) throw new Error("Backup file must be an admin route export");
  return value.route;
}

function assertLocationCount({ value, actualCount }: { value: Record<string, unknown>; actualCount: number }): void {
  if (value.total_locations !== actualCount) throw new Error("Backup total_locations must match the route");
}

function assertRouteHasLocations({ route }: { route: unknown[] }): void {
  if (route.length === 0) throw new Error("Backup route must not be empty");
}

function parseLocation({ value, index }: ValueAtIndex): BackupLocation {
  const location = asRecord({ value });
  if (!location) throw new Error(`Backup route item ${index} must be an object`);
  if (typeof location.name !== "string" || !location.name.trim()) {
    throw new Error(`Backup route item ${index} needs a name`);
  }
  const latitude = requiredNumber({ value: location.latitude, index, field: "latitude", range: { min: -90, max: 90 } });
  const longitude = normalizeLongitude({
    value: requiredNumber({ value: location.longitude, index, field: "longitude", range: { min: -360, max: 360 } }),
  });
  const utcOffset = requiredNumber({ value: location.utc_offset, index, field: "utc_offset", range: { min: -12, max: 14 } });
  validateOptionalFields({ value: location, index });
  return {
    name: location.name,
    latitude,
    longitude,
    utc_offset: utcOffset,
    arrival_time: optionalString({ value: location.arrival_time }),
    departure_time: optionalString({ value: location.departure_time }),
    country: optionalString({ value: location.country }),
    population: optionalNumber({ value: location.population }),
    priority: optionalNumber({ value: location.priority }),
    notes: optionalString({ value: location.notes }),
    fun_facts: optionalString({ value: location.fun_facts }),
    stop_duration: optionalNumber({ value: location.stop_duration }),
    is_stop: typeof location.is_stop === "boolean" ? location.is_stop : true,
  };
}

function validateOptionalFields({ value, index }: { value: Record<string, unknown>; index: number }): void {
  validateOptionalStrings({ value, index });
  validateOptionalNumbers({ value, index });
  if (value.is_stop != null && typeof value.is_stop !== "boolean") {
    throw new Error(`Backup route item ${index} has invalid is_stop`);
  }
}

function validateOptionalStrings({ value, index }: { value: Record<string, unknown>; index: number }): void {
  validateOptionalDateTime({ value: value.arrival_time, index, field: "arrival_time" });
  validateOptionalDateTime({ value: value.departure_time, index, field: "departure_time" });
  validateStringFields({ value, index, fields: ["country", "notes", "fun_facts"] });
}

function validateOptionalDateTime({ value, index, field }: FieldAtIndex): void {
  if (value == null) return;
  const schema = LegacyRouteFixtureSchema.shape.route_nodes.element.shape.schedule.shape.arrival_utc;
  if (!schema.safeParse(value).success) throw new Error(`Backup route item ${index} has invalid ${field}`);
}

function validateStringFields({ value, index, fields }: { value: Record<string, unknown>; index: number; fields: readonly string[] }): void {
  for (const field of fields) {
    if (value[field] != null && typeof value[field] !== "string") {
      throw new Error(`Backup route item ${index} has invalid ${field}`);
    }
  }
}

function validateOptionalNumbers({ value, index }: { value: Record<string, unknown>; index: number }): void {
  validateNonNegativeNumber({ value: value.population, index, field: "population" });
  validateNonNegativeNumber({ value: value.stop_duration, index, field: "stop_duration" });
  validatePriority({ value: value.priority, index });
}

function validateNonNegativeNumber({ value, index, field }: FieldAtIndex): void {
  if (value == null) return;
  if (typeof value !== "number") throw new Error(`Backup route item ${index} has invalid ${field}`);
  if (!Number.isFinite(value)) throw new Error(`Backup route item ${index} has invalid ${field}`);
  if (value < 0) throw new Error(`Backup route item ${index} has invalid ${field}`);
  if (field === "population" && !Number.isInteger(value)) {
    throw new Error(`Backup route item ${index} has invalid ${field}`);
  }
}

function validatePriority({ value, index }: ValueAtIndex): void {
  if (value == null) return;
  if (typeof value !== "number") throw new Error(`Backup route item ${index} has invalid priority`);
  validateIntegerPriority({ value, index });
}

function validateIntegerPriority({ value, index }: ValueAtIndex): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Backup route item ${index} has invalid priority`);
  }
  validatePriorityRange({ value, index });
}

function validatePriorityRange({ value, index }: ValueAtIndex): void {
  if (typeof value !== "number") throw new Error(`Backup route item ${index} has invalid priority`);
  if (value < 1 || value > 3) throw new Error(`Backup route item ${index} has invalid priority`);
}

function normalizeLongitude({ value }: { value: number }): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function requiredNumber({ value, index, field, range }: FieldAtIndex & { range: { min: number; max: number } }): number {
  if (typeof value !== "number") throw new Error(`Backup route item ${index} has invalid ${field}`);
  if (!Number.isFinite(value)) throw new Error(`Backup route item ${index} has invalid ${field}`);
  if (value < range.min || value > range.max) throw new Error(`Backup route item ${index} has invalid ${field}`);
  return value;
}

function optionalString({ value }: { value: unknown }): string | null {
  return typeof value === "string" ? value : null;
}

function optionalNumber({ value }: { value: unknown }): number | null {
  return typeof value === "number" ? value : null;
}

function asRecord({ value }: { value: unknown }): Record<string, unknown> | null {
  if (typeof value !== "object") return null;
  if (value === null) return null;
  if (Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function backupToRouteDocument(backup: RouteBackupExport): Record<string, unknown> {
  return {
    meta: {
      year: new Date(backup.backup_timestamp).getUTCFullYear(),
      route_version: "restored-from-admin-backup",
      generated_at: backup.backup_timestamp,
    },
    route_nodes: backup.route.map((location, index) => ({
      id: `backup-${index + 1}`,
      type: location.is_stop === false ? "FLYOVER" : "DELIVERY",
      is_stop: location.is_stop ?? true,
      location: {
        name: location.name,
        lat: location.latitude,
        lng: location.longitude,
        timezone_offset: location.utc_offset,
        region: location.country || "Unknown",
        country: location.country ?? null,
      },
      population: location.population ?? null,
      schedule: {
        arrival_utc: location.arrival_time ?? null,
        departure_utc: location.departure_time ?? null,
      },
      transit_to_here: null,
      stop_experience: { duration_seconds: location.is_stop === false ? 0 : Math.round((location.stop_duration ?? 0) * 60) },
      notes: location.notes ?? null,
      fun_facts: location.fun_facts ?? null,
      priority: location.priority ?? null,
    })),
  };
}

export async function restoreBackupFile({ inputPath, dataDir }: { inputPath: string; dataDir: string }): Promise<{ versionId: string; locationCount: number }> {
  if (!inputPath || !dataDir) throw new Error("Pass both --input and --data-dir");
  const root = path.resolve(dataDir);
  await assertEmptyTargetDirectory({ root });
  const backup = parseRouteBackupExport({ raw: await readFile(path.resolve(inputPath), "utf8") });
  const document = backupToRouteDocument(backup);
  assertRestoredRouteValid({ document });
  const store = createVersionedSnapshotStore(createFilesystemBackend(root));
  const version = await store.saveNewVersion(DATASET_SANTA_ROUTE, JSON.stringify(document, null, 2));
  await store.activateVersion(DATASET_SANTA_ROUTE, version.versionId);
  return { versionId: version.versionId, locationCount: backup.total_locations };
}

function assertRestoredRouteValid({ document }: { document: Record<string, unknown> }): void {
  const parsed = LegacyRouteFixtureSchema.safeParse(document);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message ?? "schema mismatch";
    throw new Error(`Restored route is invalid: ${issue}`);
  }
}

async function assertEmptyTargetDirectory({ root }: { root: string }): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (error) {
    if (asRecord({ value: error })?.code === "ENOENT") return;
    throw error;
  }
  if (entries.length > 0) {
    throw new Error(`Refusing to restore into non-empty local data directory ${root}; choose a completely empty directory`);
  }
}

function readOption({ args, name }: { args: string[]; name: string }): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;
    if (argument === name) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
      return value;
    }
    const prefix = `${name}=`;
    if (argument.startsWith(prefix)) {
      const value = argument.slice(prefix.length);
      if (!value) throw new Error(`${name} needs a value`);
      return value;
    }
  }
  return undefined;
}

function isCliEntry(): boolean {
  const script = process.argv[1];
  return Boolean(script && import.meta.url === pathToFileURL(path.resolve(script)).href);
}

if (isCliEntry()) {
  try {
    const input = readOption({ args: process.argv.slice(2), name: "--input" });
    const dataDir = readOption({ args: process.argv.slice(2), name: "--data-dir" });
    if (!input || !dataDir) throw new Error("Usage: pnpm exec tsx tools/rehearsal/restore-backup.ts --input <export.json> --data-dir <empty-local-dir>");
    const result = await restoreBackupFile({ inputPath: input, dataDir });
    console.log(`RESTORED local filesystem route locations=${result.locationCount} version=${result.versionId} data-dir=${path.resolve(dataDir)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
