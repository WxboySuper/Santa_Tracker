import { getKeyValueStore } from "./storage";
import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import { withWriteLock } from "./file-lock";
import { SEASON_MODES, type SeasonMode, type SeasonModeOverride } from "./season-mode";

export const SEASON_OVERRIDE_KEY = "emergency/season-override.json";
export const MAX_SEASON_OVERRIDE_MS = 48 * 60 * 60 * 1000;
const MAX_AUDIT_ENTRIES = 1_000;
const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;

export interface SeasonModeAuditEntry {
  action: "set" | "clear";
  who: string;
  at: string;
  previous: SeasonModeOverride | null;
}

export interface SeasonOverrideState {
  version: 1;
  override: SeasonModeOverride | null;
  updatedAt: string;
  audit: SeasonModeAuditEntry[];
}

export const DEFAULT_SEASON_OVERRIDE_STATE: SeasonOverrideState = {
  version: 1,
  override: null,
  updatedAt: "",
  audit: [],
};

export function parseSeasonOverrideState(raw: string | null): SeasonOverrideState {
  if (!raw) return DEFAULT_SEASON_OVERRIDE_STATE;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !hasExactKeys(value, ["version", "override", "updatedAt", "audit"])) return DEFAULT_SEASON_OVERRIDE_STATE;
    if (value.version !== 1 || !isTimestamp(value.updatedAt) || !Array.isArray(value.audit)) return DEFAULT_SEASON_OVERRIDE_STATE;
    if (value.override !== null && !isOverride(value.override)) return DEFAULT_SEASON_OVERRIDE_STATE;
    if (!value.audit.every(isAuditEntry)) return DEFAULT_SEASON_OVERRIDE_STATE;
    return { version: 1, override: value.override, updatedAt: value.updatedAt, audit: value.audit.slice(-MAX_AUDIT_ENTRIES) };
  } catch {
    return DEFAULT_SEASON_OVERRIDE_STATE;
  }
}

function isOverride(value: unknown): value is SeasonModeOverride {
  if (!isRecord(value) || !hasExactKeys(value, ["mode", "setAt", "expiresAt", "reason", "setBy"])) return false;
  if (!isSeasonMode(value.mode) || !isTimestamp(value.setAt) || !isTimestamp(value.expiresAt)) return false;
  const duration = Date.parse(value.expiresAt) - Date.parse(value.setAt);
  return duration > 0 && duration <= MAX_SEASON_OVERRIDE_MS
    && typeof value.reason === "string" && value.reason.trim().length > 0 && value.reason.length <= 500
    && typeof value.setBy === "string" && value.setBy.trim().length > 0 && value.setBy.length <= 100;
}

function isAuditEntry(value: unknown): value is SeasonModeAuditEntry {
  if (!isRecord(value) || !hasExactKeys(value, ["action", "who", "at", "previous"])) return false;
  return (value.action === "set" || value.action === "clear")
    && typeof value.who === "string" && value.who.length > 0
    && isTimestamp(value.at)
    && (value.previous === null || isOverride(value.previous));
}

function isSeasonMode(value: unknown): value is SeasonMode {
  return typeof value === "string" && (SEASON_MODES as readonly string[]).includes(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return false;
  const date = new Date(value);
  const fraction = match[2] ? `.${match[2].padEnd(3, "0")}` : ".000";
  return !Number.isNaN(date.getTime()) && date.toISOString() === `${match[1]}${fraction}Z`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
}

export interface SeasonOverrideRepository {
  read(): Promise<SeasonOverrideState>;
  set(override: SeasonModeOverride, expectedUpdatedAt: string, who: string): Promise<SeasonOverrideState | null>;
  clear(expectedUpdatedAt: string, who: string): Promise<SeasonOverrideState | null>;
}

type Lock = <T>(work: () => Promise<T>) => Promise<T>;

/** Repository factory lets tests use the local filesystem store with the same CAS path as runtime. */
export function createSeasonOverrideRepository(
  store: { read(key: string): Promise<string | null>; write(key: string, body: string): Promise<void> },
  now: () => number = Date.now,
  lock: Lock = withWriteLock,
): SeasonOverrideRepository {
  async function replace(override: SeasonModeOverride | null, expectedUpdatedAt: string, who: string): Promise<SeasonOverrideState | null> {
    return lock(async () => {
      const current = parseSeasonOverrideState(await store.read(SEASON_OVERRIDE_KEY));
      if (current.updatedAt !== expectedUpdatedAt) return null;
      if (override !== null && !isOverride(override)) throw new Error("Invalid season override");
      const timestamp = new Date(Math.max(now(), Date.parse(current.updatedAt) + 1 || 0)).toISOString();
      const action: SeasonModeAuditEntry["action"] = override === null ? "clear" : "set";
      const next: SeasonOverrideState = {
        version: 1,
        override,
        updatedAt: timestamp,
        audit: [...current.audit, { action, who, at: timestamp, previous: current.override }].slice(-MAX_AUDIT_ENTRIES),
      };
      await store.write(SEASON_OVERRIDE_KEY, JSON.stringify(next));
      return next;
    });
  }
  return {
    async read() { return parseSeasonOverrideState(await store.read(SEASON_OVERRIDE_KEY)); },
    set(override, expectedUpdatedAt, who) { return replace(override, expectedUpdatedAt, who); },
    clear(expectedUpdatedAt, who) { return replace(null, expectedUpdatedAt, who); },
  };
}

let repository: SeasonOverrideRepository | null = null;
function getRepository(): SeasonOverrideRepository {
  if (!repository) repository = createSeasonOverrideRepository(getKeyValueStore(getSantaSnapshotsBucket()));
  return repository;
}

export function readSeasonOverrideState(): Promise<SeasonOverrideState> {
  return getRepository().read();
}

export function writeSeasonOverride(override: SeasonModeOverride, expectedUpdatedAt: string, who: string): Promise<SeasonOverrideState | null> {
  return getRepository().set(override, expectedUpdatedAt, who);
}

export function clearSeasonOverride(expectedUpdatedAt: string, who: string): Promise<SeasonOverrideState | null> {
  return getRepository().clear(expectedUpdatedAt, who);
}
