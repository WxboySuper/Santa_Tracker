import { getKeyValueStore, type KeyValueStore } from "./storage";
import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import type { SeasonFeature } from "./season";
import { withWriteLock } from "./file-lock";

export interface FeatureFlags {
  version: 1;
  hidden: Record<SeasonFeature, boolean>;
  updatedAt: string;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  version: 1,
  hidden: { tracker: false, advent: false },
  updatedAt: "",
};

export const FEATURE_FLAGS_KEY = "emergency/feature-flags.json";
const CACHE_TTL_MS = 7_000;
const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;

export function parseFeatureFlags(raw: string | null): FeatureFlags {
  if (!raw) return DEFAULT_FEATURE_FLAGS;
  return parseFeatureFlagsJson(raw);
}

function parseFeatureFlagsJson(raw: string): FeatureFlags {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return DEFAULT_FEATURE_FLAGS;
  }
  if (!isFeatureFlagsRecord(value)) return DEFAULT_FEATURE_FLAGS;
  return {
    version: 1,
    hidden: { tracker: value.hidden.tracker, advent: value.hidden.advent },
    updatedAt: value.updatedAt,
  };
}

interface FeatureFlagsRecord {
  hidden: HiddenFlagsRecord;
  updatedAt: string;
}

interface HiddenFlagsRecord {
  tracker: boolean;
  advent: boolean;
}

function isFeatureFlagsRecord(value: unknown): value is FeatureFlagsRecord {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ["version", "hidden", "updatedAt"])) return false;
  if (value.version !== 1 || typeof value.updatedAt !== "string") return false;
  if (!isHiddenFlagsRecord(value.hidden)) return false;
  return isValidTimestamp(value.updatedAt);
}

function isHiddenFlagsRecord(value: unknown): value is HiddenFlagsRecord {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ["tracker", "advent"])) return false;
  return typeof value.tracker === "boolean" && typeof value.advent === "boolean";
}

function isValidTimestamp(value: string): boolean {
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
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

export interface FeatureFlagCache {
  read(): Promise<FeatureFlags>;
  invalidate(): void;
}

export function createFeatureFlagCache(
  store: Pick<KeyValueStore, "read">,
  now: () => number = Date.now,
  ttlMs = CACHE_TTL_MS,
): FeatureFlagCache {
  let cached: FeatureFlags = DEFAULT_FEATURE_FLAGS;
  let expiresAt = 0;
  let pending: Promise<FeatureFlags> | null = null;
  let generation = 0;
  return {
    async read() {
      const current = now();
      if (expiresAt > current) return cached;
      if (pending) return pending;
      const readGeneration = generation;
      const readPromise = Promise.resolve()
        .then(() => store.read(FEATURE_FLAGS_KEY))
        .then(parseFeatureFlags)
        .catch(() => DEFAULT_FEATURE_FLAGS)
        .then(flags => {
          if (generation === readGeneration) {
            cached = flags;
            expiresAt = now() + ttlMs;
          }
          return flags;
        })
        .finally(() => { if (pending === readPromise) pending = null; });
      pending = readPromise;
      return readPromise;
    },
    invalidate() {
      expiresAt = 0;
      generation += 1;
      pending = null;
    },
  };
}

let cache: FeatureFlagCache | null = null;

function getCache(): FeatureFlagCache {
  if (!cache) cache = createFeatureFlagCache(getKeyValueStore(getSantaSnapshotsBucket()));
  return cache;
}

export function readFeatureFlags(): Promise<FeatureFlags> {
  try {
    return getCache().read();
  } catch {
    return Promise.resolve(DEFAULT_FEATURE_FLAGS);
  }
}

export async function readFreshFeatureFlags(): Promise<FeatureFlags> {
  try {
    const store = getKeyValueStore(getSantaSnapshotsBucket());
    return parseFeatureFlags(await store.read(FEATURE_FLAGS_KEY));
  } catch {
    return DEFAULT_FEATURE_FLAGS;
  }
}

export async function writeFeatureFlags(hidden: Record<SeasonFeature, boolean>, expectedUpdatedAt: string): Promise<FeatureFlags | null> {
  const store = getKeyValueStore(getSantaSnapshotsBucket());
  const flags = await withWriteLock(async () => {
    const current = parseFeatureFlags(await store.read(FEATURE_FLAGS_KEY));
    if (current.updatedAt !== expectedUpdatedAt) return null;
    const previousTimestamp = Date.parse(current.updatedAt);
    const updatedAt = new Date(Math.max(Date.now(), Number.isNaN(previousTimestamp) ? 0 : previousTimestamp + 1)).toISOString();
    const replacement: FeatureFlags = { version: 1, hidden, updatedAt };
    await store.write(FEATURE_FLAGS_KEY, JSON.stringify(replacement));
    return replacement;
  });
  if (flags) cache?.invalidate();
  return flags;
}

export function resetFeatureFlagCacheForTests(): void {
  cache = null;
}
