import { z } from "zod";
import {
  FEATURE_FLAG_REGISTRY,
  FeatureFlagsSchema,
  SeasonalConfigSchema,
  type FeatureFlagKey,
  type FeatureFlags,
  type SeasonalConfig,
} from "@santa-tracker/contracts";
import { getKeyValueStore, getSnapshotStore, type KeyValueStore } from "./storage";
import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import { withWriteLock } from "./file-lock";
import { readSeasonOverrideState } from "./season-overrides";
import { effectiveSeasonMode, seasonMode, type SeasonMode } from "./season-mode";
import { DATASET_SANTA_ROUTE } from "./storage/types";

export const SEASON_CONFIG_ENVIRONMENTS = ["development", "preview", "production"] as const;
export type SeasonConfigEnvironment = typeof SEASON_CONFIG_ENVIRONMENTS[number];
export type FeatureFlagOverrides = Partial<Record<FeatureFlagKey, { enabled: boolean; expiresAt: string | null }>>;
const MAX_AUDIT_ENTRIES = 1_000;
const FEATURE_KEYS = Object.keys(FEATURE_FLAG_REGISTRY) as [FeatureFlagKey, ...FeatureFlagKey[]];
const environmentSchema = z.enum(SEASON_CONFIG_ENVIRONMENTS);
const timestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(value => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
});
const flagOverrideSchema = z.object({ enabled: z.boolean(), expiresAt: timestampSchema.nullable() }).strict();
const flagOverridesSchema = z.partialRecord(z.enum(FEATURE_KEYS), flagOverrideSchema).superRefine((overrides, context) => {
  for (const [key, override] of Object.entries(overrides)) {
    if (override.expiresAt === null) continue;
    if (Date.parse(override.expiresAt) <= 0) context.addIssue({ code: "custom", path: [key, "expiresAt"], message: "Expiry must be after the epoch" });
  }
});
const auditEntrySchema = z.object({
  actor: z.string().min(1).max(100),
  at: timestampSchema,
  reason: z.string().min(1).max(500),
  previous: flagOverridesSchema,
  next: flagOverridesSchema,
}).strict();
const stateSchema = z.object({
  version: z.literal(1),
  environment: environmentSchema,
  overrides: flagOverridesSchema,
  updatedAt: timestampSchema,
  audit: z.array(auditEntrySchema),
}).strict();

export interface SeasonConfigAuditEntry {
  actor: string;
  at: string;
  reason: string;
  previous: FeatureFlagOverrides;
  next: FeatureFlagOverrides;
}

export interface SeasonConfigState {
  version: 1;
  environment: SeasonConfigEnvironment;
  overrides: FeatureFlagOverrides;
  updatedAt: string;
  audit: SeasonConfigAuditEntry[];
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = FeatureFlagsSchema.parse({});

export function getSeasonConfigEnvironment(value = process.env.SANTA_ENVIRONMENT): SeasonConfigEnvironment {
  const parsed = environmentSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function seasonConfigStorageKey(environment: SeasonConfigEnvironment): string {
  return `season/config/${environment}.json`;
}

export function defaultSeasonConfigState(environment: SeasonConfigEnvironment): SeasonConfigState {
  return { version: 1, environment, overrides: {}, updatedAt: new Date(0).toISOString(), audit: [] };
}

export function parseSeasonConfig(raw: string | null, environment: SeasonConfigEnvironment): SeasonConfigState {
  if (!raw) return defaultSeasonConfigState(environment);
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return defaultSeasonConfigState(environment); }
  const parsed = stateSchema.safeParse(value);
  if (!parsed.success || parsed.data.environment !== environment) return defaultSeasonConfigState(environment);
  return { ...parsed.data, audit: parsed.data.audit.slice(-MAX_AUDIT_ENTRIES) };
}

export interface SeasonConfigRepository {
  read(environment: SeasonConfigEnvironment): Promise<SeasonConfigState>;
  replace(environment: SeasonConfigEnvironment, expectedUpdatedAt: string, overrides: FeatureFlagOverrides, actor: string, reason: string): Promise<SeasonConfigState | null>;
}

type Lock = <T>(work: () => Promise<T>) => Promise<T>;

export function createSeasonConfigRepository(
  store: Pick<KeyValueStore, "read" | "write">,
  now: () => number = Date.now,
  lock: Lock = withWriteLock,
): SeasonConfigRepository {
  return {
    async read(environment) { return parseSeasonConfig(await store.read(seasonConfigStorageKey(environment)), environment); },
    replace(environment, expectedUpdatedAt, overrides, actor, reason) {
      return lock(async () => {
        const current = parseSeasonConfig(await store.read(seasonConfigStorageKey(environment)), environment);
        if (current.updatedAt !== expectedUpdatedAt) return null;
        const at = new Date(Math.max(now(), Date.parse(current.updatedAt) + 1 || 0)).toISOString();
        const next: SeasonConfigState = {
          version: 1,
          environment,
          overrides,
          updatedAt: at,
          audit: [...current.audit, { actor, at, reason, previous: current.overrides, next: overrides }].slice(-MAX_AUDIT_ENTRIES),
        };
        await store.write(seasonConfigStorageKey(environment), JSON.stringify(next));
        return next;
      });
    },
  };
}

let repository: SeasonConfigRepository | null = null;
function getRepository(): SeasonConfigRepository {
  if (!repository) repository = createSeasonConfigRepository(getKeyValueStore(getSantaSnapshotsBucket()));
  return repository;
}

export async function readEffectiveSeasonConfig(
  environment: SeasonConfigEnvironment,
  at: Date,
  candidateOverrides?: FeatureFlagOverrides,
): Promise<{
  environment: SeasonConfigEnvironment;
  updatedAt: string;
  seasonalConfig: SeasonalConfig;
  expiredFlags: FeatureFlagKey[];
  modeOverrideStatus: "none" | "active" | "expired";
}> {
  const [state, seasonOverride, active] = await Promise.all([
    getRepository().read(environment),
    readSeasonOverrideState(),
    getSnapshotStore(getSantaSnapshotsBucket()).readActiveVersion(DATASET_SANTA_ROUTE),
  ]);
  const selectedOverrides = candidateOverrides ?? state.overrides;
  const { flags, expiredFlags } = resolveFeatureFlags(selectedOverrides, at);
  const effectiveMode = effectiveSeasonMode(at, seasonMode(at), seasonOverride.override);
  const seasonalConfig = SeasonalConfigSchema.parse({
    mode: effectiveMode.mode satisfies SeasonMode,
    flags,
    activeSnapshotId: active?.versionId ?? null,
  });
  return { environment, updatedAt: state.updatedAt, seasonalConfig, expiredFlags, modeOverrideStatus: effectiveMode.overrideStatus };
}

export function resolveFeatureFlags(overrides: FeatureFlagOverrides, at: Date): { flags: FeatureFlags; expiredFlags: FeatureFlagKey[] } {
  const flags = { ...DEFAULT_FEATURE_FLAGS };
  const expiredFlags: FeatureFlagKey[] = [];
  for (const [key, override] of Object.entries(overrides) as [FeatureFlagKey, NonNullable<FeatureFlagOverrides[FeatureFlagKey]>][]) {
    if (override.expiresAt !== null && Date.parse(override.expiresAt) <= at.getTime()) {
      expiredFlags.push(key);
      continue;
    }
    flags[key] = override.enabled;
  }
  return { flags, expiredFlags };
}

export function parseFeatureFlagOverrides(value: unknown): FeatureFlagOverrides | null {
  const parsed = flagOverridesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
