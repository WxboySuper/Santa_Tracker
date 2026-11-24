import { z } from "zod";
import { getKeyValueStore } from "./storage";
import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import { withWriteLock } from "./file-lock";
import { SEASON_MODES, type SeasonModeOverride } from "./season-mode";

export const SEASON_OVERRIDE_KEY = "emergency/season-override.json";
export const MAX_SEASON_OVERRIDE_MS = 48 * 60 * 60 * 1000;
const MAX_AUDIT_ENTRIES = 1_000;
const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;
const timestampSchema = z.string().regex(ISO_DATE_TIME).refine(isCanonicalTimestamp);
const seasonModeSchema = z.enum(SEASON_MODES);
const seasonModeOverrideSchema = z.object({
  mode: seasonModeSchema,
  setAt: timestampSchema,
  expiresAt: timestampSchema,
  reason: z.string().min(1).max(500).refine(value => value.trim().length > 0),
  setBy: z.string().min(1).max(100).refine(value => value.trim().length > 0),
}).strict().refine(value => {
  const duration = Date.parse(value.expiresAt) - Date.parse(value.setAt);
  return duration > 0 && duration <= MAX_SEASON_OVERRIDE_MS;
});
const seasonModeAuditEntrySchema = z.object({
  action: z.enum(["set", "clear"]),
  who: z.string().min(1),
  at: timestampSchema,
  previous: seasonModeOverrideSchema.nullable(),
}).strict();
const seasonOverrideStateSchema = z.object({
  version: z.literal(1),
  override: seasonModeOverrideSchema.nullable(),
  updatedAt: timestampSchema,
  audit: z.array(seasonModeAuditEntrySchema),
}).strict();

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
  const parsed = seasonOverrideStateSchema.safeParse(parseJson(raw));
  return parsed.success
    ? { ...parsed.data, audit: parsed.data.audit.slice(-MAX_AUDIT_ENTRIES) }
    : DEFAULT_SEASON_OVERRIDE_STATE;
}

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw) as unknown; } catch { return null; }
}

function isCanonicalTimestamp(value: string): boolean {
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return false;
  const date = new Date(value);
  const fraction = match[2] ? `.${match[2].padEnd(3, "0")}` : ".000";
  return !Number.isNaN(date.getTime()) && date.toISOString() === `${match[1]}${fraction}Z`;
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
      if (override !== null && !seasonModeOverrideSchema.safeParse(override).success) throw new Error("Invalid season override");
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
