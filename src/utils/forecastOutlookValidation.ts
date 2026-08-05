import type { ImportValidationResult } from './forecastValidationTypes';
import { MAX_ARRAY_ITEMS, fail } from './forecastValidationTypes';
import { validateFeature } from './forecastGeometryValidation';

/** Maximum features per outlook probability map. */
export const MAX_FEATURES_PER_MAP = 5_000;

const OUTLOOK_MAP_FIELDS = new Set(['tornado', 'wind', 'hail', 'totalSevere', 'day4-8', 'categorical']);

/**
 * Normalizes a serialized outlook map into `[probability, features][]` entries,
 * returning null when the value is neither the canonical array form nor a
 * legacy plain object.
 */
// @codescene(disable:"Complex Conditional")
const outlookMapEntries = (value: unknown): Array<[string, unknown]> | null => {
  if (Array.isArray(value)) {
    const entries: Array<[string, unknown]> = [];
    for (const entry of value) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
        return null;
      }
      entries.push([entry[0], entry[1]]);
    }
    return entries;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>);
  }

  return null;
};

/** Validates one probability entry and its features, returning a failure or null. */
const validateProbabilityEntry = (
  probability: string,
  features: unknown,
  path: string,
): ImportValidationResult | null => {
  if (!Array.isArray(features)) {
    return fail(`${path} entry "${probability}" is missing its feature list.`);
  }
  if (features.length > MAX_FEATURES_PER_MAP) {
    return fail(`${path} entry "${probability}" contains too many features.`);
  }
  for (const feature of features) {
    const featureResult = validateFeature(feature);
    if (featureResult) return featureResult;
  }
  return null;
};

/**
 * Validates one serialized outlook map (probability -> feature array) with a
 * per-map feature bound. Supports the canonical `[probability, features][]`
 * serialization plus legacy plain-object maps.
 */
export const validateOutlookMap = (value: unknown, path: string): ImportValidationResult | null => {
  const entries = outlookMapEntries(value);
  if (entries === null) {
    return fail(`${path} must be an array of probability entries or a map object.`);
  }

  if (entries.length > MAX_ARRAY_ITEMS) {
    return fail(`${path} contains too many probability entries.`);
  }

  let featureCount = 0;
  for (const [probability, features] of entries) {
    const entryResult = validateProbabilityEntry(probability, features, path);
    if (entryResult) return entryResult;
    featureCount += Array.isArray(features) ? features.length : 0;
    if (featureCount > MAX_FEATURES_PER_MAP) {
      return fail(`${path} contains too many total features.`);
    }
  }

  return null;
};

/** Validates the legacy single-day outlooks section. */
// @codescene(disable:"Complex Conditional")
export const validateLegacyOutlooks = (outlooks: unknown): ImportValidationResult => {
  if (typeof outlooks !== 'object' || outlooks === null || Array.isArray(outlooks)) {
    return fail('Forecast outlooks are not a valid object.');
  }
  for (const field of OUTLOOK_MAP_FIELDS) {
    const map = (outlooks as Record<string, unknown>)[field];
    if (map === undefined) continue;
    const result = validateOutlookMap(map, `outlooks.${field}`);
    if (result) return result;
  }
  return { ok: true };
};

/** Returns a failure when a day key is not an integer in the 1-8 range. */
// @codescene(disable:"Complex Conditional")
const invalidDayKey = (dayKey: string): ImportValidationResult | null => {
  const dayNumber = Number(dayKey);
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 8) {
    return fail(`forecastCycle contains an invalid day "${dayKey}".`);
  }
  return null;
};

/** Validates every outlook map on one saved day. */
const validateDayOutlookMaps = (dayKey: string, dayData: unknown): ImportValidationResult | null => {
  for (const field of OUTLOOK_MAP_FIELDS) {
    const map = (dayData as Record<string, unknown>)[field];
    if (map === undefined) continue;
    const result = validateOutlookMap(map, `forecastCycle.days.${dayKey}.data.${field}`);
    if (result) return result;
  }
  return null;
};

/** Validates one saved forecast day and its outlook maps. */
const validateForecastDay = (dayKey: string, day: unknown): ImportValidationResult | null => {
  const invalidDay = invalidDayKey(dayKey);
  if (invalidDay) return invalidDay;

  if (!day || typeof day !== 'object' || Array.isArray(day)) {
    return fail(`forecastCycle day "${dayKey}" is not a valid object.`);
  }

  const dayData = (day as { data?: unknown }).data;
  if (!dayData || typeof dayData !== 'object' || Array.isArray(dayData)) {
    return fail(`forecastCycle day "${dayKey}" is missing valid outlook data.`);
  }

  return validateDayOutlookMaps(dayKey, dayData);
};

/** Validates the multi-day forecastCycle section of a saved document. */
// @codescene(disable:"Complex Method", disable:"Overall Code Complexity")
export const validateForecastCycle = (value: unknown): ImportValidationResult => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('forecastCycle is not a valid object.');
  }

  const cycle = value as { days?: unknown };
  if (cycle.days === undefined) {
    return fail('forecastCycle is missing its days map.');
  }

  if (typeof cycle.days !== 'object' || cycle.days === null || Array.isArray(cycle.days)) {
    return fail('forecastCycle.days is not a valid object.');
  }

  const days = cycle.days as Record<string, unknown>;
  const dayKeys = Object.keys(days);
  if (dayKeys.length > 8) {
    return fail('forecastCycle contains more than the supported forecast days.');
  }

  for (const dayKey of dayKeys) {
    const dayResult = validateForecastDay(dayKey, days[dayKey]);
    if (dayResult) return dayResult;
  }

  return { ok: true };
};
