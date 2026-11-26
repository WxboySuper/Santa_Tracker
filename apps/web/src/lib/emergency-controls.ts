import { getKeyValueStore, type KeyValueStore } from "./storage";
import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import { withWriteLock } from "./file-lock";

export const EMERGENCY_CONTROLS_KEY = "emergency/launch-controls.json";
const MAX_AUDIT_ENTRIES = 1_000;

export interface EmergencyControlValues {
  noMap: boolean;
  simplifiedTracker: boolean;
  killedFeatures: { weather: boolean; soundscape: boolean };
}

export interface EmergencyControlAuditEntry {
  actor: string;
  at: string;
  reason: string;
  previous: EmergencyControlValues;
  next: EmergencyControlValues;
}

export interface EmergencyControls extends EmergencyControlValues {
  version: 1;
  updatedAt: string;
  audit: EmergencyControlAuditEntry[];
}

export const DEFAULT_EMERGENCY_CONTROLS: EmergencyControls = {
  version: 1,
  noMap: false,
  simplifiedTracker: false,
  killedFeatures: { weather: false, soundscape: false },
  updatedAt: "",
  audit: [],
};

const SAFE_EMERGENCY_CONTROLS: EmergencyControls = {
  ...DEFAULT_EMERGENCY_CONTROLS,
  noMap: true,
  simplifiedTracker: true,
  killedFeatures: { weather: true, soundscape: true },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseValues(value: unknown): EmergencyControlValues | null {
  if (!isRecord(value) || !isRecord(value.killedFeatures)) return null;
  if (typeof value.noMap !== "boolean" || typeof value.simplifiedTracker !== "boolean") return null;
  if (Object.keys(value.killedFeatures).sort().join(",") !== "soundscape,weather") return null;
  if (typeof value.killedFeatures.weather !== "boolean" || typeof value.killedFeatures.soundscape !== "boolean") return null;
  return {
    noMap: value.noMap,
    simplifiedTracker: value.simplifiedTracker,
    killedFeatures: { weather: value.killedFeatures.weather, soundscape: value.killedFeatures.soundscape },
  };
}

export function parseEmergencyControls(raw: string | null): EmergencyControls {
  if (!raw) return DEFAULT_EMERGENCY_CONTROLS;
  try {
    const parsed: unknown = JSON.parse(raw);
    return decodeEmergencyControls(parsed);
  } catch {
    return SAFE_EMERGENCY_CONTROLS;
  }
}

function decodeEmergencyControls(parsed: unknown): EmergencyControls {
  if (!hasValidControlsHeader(parsed)) return SAFE_EMERGENCY_CONTROLS;
  const value = parsed as Record<string, unknown>;
  const values = parseValues(value);
  if (!values || !isTimestamp(value.updatedAt as string)) return SAFE_EMERGENCY_CONTROLS;
  const audit = (value.audit as unknown[]).filter(isValidAuditEntry).slice(-MAX_AUDIT_ENTRIES);
  if (audit.length !== (value.audit as unknown[]).length) return SAFE_EMERGENCY_CONTROLS;
  return { version: 1, ...values, updatedAt: value.updatedAt as string, audit };
}

function hasValidControlsHeader(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (Object.keys(value).sort().join(",") !== "audit,killedFeatures,noMap,simplifiedTracker,updatedAt,version") return false;
  return value.version === 1 && typeof value.updatedAt === "string" && Array.isArray(value.audit);
}

function isTimestamp(value: string): boolean {
  return value === "" || (!Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value);
}

function isValidAuditEntry(value: unknown): value is EmergencyControlAuditEntry {
  if (!hasAuditEntryShape(value)) return false;
  const entry = value as Record<string, unknown>;
  return isValidAuditMetadata(entry) && parseValues(entry.previous) !== null && parseValues(entry.next) !== null;
}

function hasAuditEntryShape(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).sort().join(",") === "actor,at,next,previous,reason";
}

function isValidAuditMetadata(entry: Record<string, unknown>): boolean {
  return typeof entry.actor === "string" && entry.actor.length > 0
    && typeof entry.at === "string" && isTimestamp(entry.at) && entry.at !== ""
    && typeof entry.reason === "string" && entry.reason.trim().length > 0;
}

export interface EmergencyControlsRepository {
  read(): Promise<EmergencyControls>;
  replace(values: EmergencyControlValues, expectedUpdatedAt: string, actor: string, reason: string): Promise<EmergencyControls | null>;
}

type Lock = <T>(work: () => Promise<T>) => Promise<T>;

export function createEmergencyControlsRepository(
  store: Pick<KeyValueStore, "read" | "write">,
  now: () => number = Date.now,
  lock: Lock = withWriteLock,
): EmergencyControlsRepository {
  return {
    async read() { return parseEmergencyControls(await store.read(EMERGENCY_CONTROLS_KEY)); },
    replace(values, expectedUpdatedAt, actor, reason) {
      return lock(async () => {
        const current = parseEmergencyControls(await store.read(EMERGENCY_CONTROLS_KEY));
        if (current.updatedAt !== expectedUpdatedAt) return null;
        const at = new Date(Math.max(now(), Date.parse(current.updatedAt) + 1 || 0)).toISOString();
        const next: EmergencyControls = {
          version: 1,
          ...values,
          updatedAt: at,
          audit: [...current.audit, { actor, at, reason, previous: projectValues(current), next: values }].slice(-MAX_AUDIT_ENTRIES),
        };
        await store.write(EMERGENCY_CONTROLS_KEY, JSON.stringify(next));
        return next;
      });
    },
  };
}

function projectValues(value: EmergencyControlValues): EmergencyControlValues {
  return {
    noMap: value.noMap,
    simplifiedTracker: value.simplifiedTracker,
    killedFeatures: { weather: value.killedFeatures.weather, soundscape: value.killedFeatures.soundscape },
  };
}

let repository: EmergencyControlsRepository | null = null;
function getRepository(): EmergencyControlsRepository {
  if (!repository) repository = createEmergencyControlsRepository(getKeyValueStore(getSantaSnapshotsBucket()));
  return repository;
}

export function readEmergencyControls(): Promise<EmergencyControls> {
  return getRepository().read();
}

export function replaceEmergencyControls(values: EmergencyControlValues, expectedUpdatedAt: string, actor: string, reason: string): Promise<EmergencyControls | null> {
  return getRepository().replace(values, expectedUpdatedAt, actor, reason);
}
