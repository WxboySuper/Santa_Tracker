import type { Feature, Geometry } from 'geojson';

/**
 * Bounded, schema-aware validation for imported forecast files.
 *
 * The previous gate was shallow (`Boolean(data.forecastCycle || data.outlooks)`),
 * so deeply nested, oversized, or pathological payloads could reach
 * normalization or Redux state. This module validates the whole parsed tree
 * against explicit bounds BEFORE any state mutation:
 *
 * - a byte gate on the raw file,
 * - nesting and array/string bounds,
 * - supported GeoJSON geometry types,
 * - finite coordinates and per-ring/coordinate counts.
 *
 * Validation is intentionally independent of deserialization so invalid input
 * can never partially mutate the active forecast.
 */

export interface ImportValidationResult {
  ok: boolean;
  /** Human-readable, safe reason suitable for a toast. */
  reason?: string;
}

/** Maximum accepted import file size (25 MB). */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
/** Maximum allowed object nesting depth. */
export const MAX_NESTING_DEPTH = 32;
/** Maximum number of items in any single array (protects against extreme collections). */
export const MAX_ARRAY_ITEMS = 100_000;
/** Maximum features per outlook probability map. */
export const MAX_FEATURES_PER_MAP = 5_000;
/** Maximum string length anywhere in the document. */
export const MAX_STRING_LENGTH = 100_000;
/** Maximum coordinate positions per geometry. */
export const MAX_COORDINATE_POSITIONS = 500_000;

const SUPPORTED_GEOMETRY_TYPES = new Set<string>([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
]);

const OUTLOOK_MAP_FIELDS = new Set(['tornado', 'wind', 'hail', 'totalSevere', 'day4-8', 'categorical']);

/** Returns a structured validation failure with an actionable message. */
const fail = (reason: string): ImportValidationResult => ({ ok: false, reason });

/**
 * Bounds-check the raw import file bytes before parsing.
 * @returns {ImportValidationResult}
 */
export const validateImportFileBytes = (bytes: Uint8Array | ArrayBuffer | undefined | null): ImportValidationResult => {
  if (bytes == null) return { ok: true };
  const byteLength = bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength;
  if (byteLength > MAX_IMPORT_BYTES) {
    return fail(`File is too large (${(byteLength / 1024 / 1024).toFixed(1)} MB); the maximum supported size is ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`);
  }
  return { ok: true };
};

/**
 * Counts coordinate positions inside a GeoJSON geometry, bounding work early
 * when the limit is exceeded.
 */
const countCoordinatePositions = (geometry: Geometry, limit: number): number => {
  let count = 0;
  const visit = (value: unknown): void => {
    if (count >= limit) return;
    if (Array.isArray(value)) {
      if (value.length > 0 && Array.isArray(value[0])) {
        value.forEach(visit);
      } else {
        count += value.length;
      }
    }
  };
  if (geometry.type === 'GeometryCollection') {
    return 0;
  }
  visit((geometry as { coordinates?: unknown }).coordinates);
  return count;
};

/** Validates the child geometries of a GeometryCollection. */
const validateGeometryCollection = (geometries: unknown): ImportValidationResult | null => {
  if (!Array.isArray(geometries) || geometries.length > MAX_ARRAY_ITEMS) {
    return fail('Forecast geometry collection is invalid or too large.');
  }
  for (const child of geometries) {
    const childResult = validateGeometry(child);
    if (childResult) return childResult;
  }
  return null;
};

/** Validates a non-collection geometry's coordinates and size. */
const validateGeometryCoordinates = (geometry: { type?: unknown; coordinates?: unknown }): ImportValidationResult | null => {
  if (!Array.isArray(geometry.coordinates)) {
    return fail(`Forecast geometry "${geometry.type}" is missing coordinates.`);
  }
  if (countCoordinatePositions(geometry as Geometry, MAX_COORDINATE_POSITIONS) >= MAX_COORDINATE_POSITIONS) {
    return fail('Forecast geometry contains too many coordinates.');
  }
  return null;
};

/** Validates one GeoJSON geometry object against supported types and coordinate bounds. */
const validateGeometry = (value: unknown): ImportValidationResult | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('Forecast geometry is not a valid object.');
  }

  const geometry = value as { type?: unknown; coordinates?: unknown; geometries?: unknown };
  if (typeof geometry.type !== 'string' || !SUPPORTED_GEOMETRY_TYPES.has(geometry.type)) {
    return fail(`Forecast geometry uses unsupported type "${String(geometry.type)}".`);
  }

  if (geometry.type === 'GeometryCollection') {
    return validateGeometryCollection(geometry.geometries);
  }

  return validateGeometryCoordinates(geometry);
};

/** Validates one serialized outlook feature and its geometry. */
const validateFeature = (value: unknown): ImportValidationResult | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('Forecast feature is not a valid object.');
  }

  const feature = value as Feature;
  if (feature.type !== 'Feature') {
    return fail('Forecast geometry entry is missing "type": "Feature".');
  }

  const geometryResult = validateGeometry(feature.geometry);
  if (geometryResult) return geometryResult;

  const properties = feature.properties;
  if (properties !== null && properties !== undefined && (typeof properties !== 'object' || Array.isArray(properties))) {
    return fail('Forecast feature properties are invalid.');
  }

  return null;
};

/**
 * Validates one serialized outlook map (probability -> feature array) with a
 * per-map feature bound. Supports the canonical `[probability, features][]`
 * serialization plus legacy plain-object maps.
 */
const validateOutlookMap = (value: unknown, path: string): ImportValidationResult | null => {
  const entries = outlookMapEntries(value);
  if (entries === null) {
    return fail(`${path} must be an array of probability entries or a map object.`);
  }

  if (entries.length > MAX_ARRAY_ITEMS) {
    return fail(`${path} contains too many probability entries.`);
  }

  let featureCount = 0;
  for (const [probability, features] of entries) {
    if (!Array.isArray(features)) {
      return fail(`${path} entry "${probability}" is missing its feature list.`);
    }
    if (features.length > MAX_FEATURES_PER_MAP) {
      return fail(`${path} entry "${probability}" contains too many features.`);
    }
    featureCount += features.length;
    if (featureCount > MAX_FEATURES_PER_MAP) {
      return fail(`${path} contains too many total features.`);
    }
    for (const feature of features) {
      const featureResult = validateFeature(feature);
      if (featureResult) return featureResult;
    }
  }

  return null;
};

/**
 * Normalizes a serialized outlook map into `[probability, features][]` entries,
 * returning null when the value is neither the canonical array form nor a
 * legacy plain object.
 */
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

/**
 * Recursively enforces string-length and nesting bounds over the parsed tree.
 * The outlook maps are validated structurally on top of these generic bounds.
 */
const validateTreeBounds = (
  value: unknown,
  depth: number,
): ImportValidationResult | null => {
  if (depth > MAX_NESTING_DEPTH) {
    return fail('Forecast file nests too deeply.');
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? fail('Forecast file contains an excessively long string.')
      : null;
  }

  if (Array.isArray(value)) {
    return validateArrayBounds(value, depth);
  }

  return validateObjectBounds(value, depth);
};

/** Bounds-checks one array and its children. */
const validateArrayBounds = (value: unknown[], depth: number): ImportValidationResult | null => {
  if (value.length > MAX_ARRAY_ITEMS) {
    return fail('Forecast file contains an excessively large array.');
  }
  for (const item of value) {
    const result = validateTreeBounds(item, depth + 1);
    if (result) return result;
  }
  return null;
};

/** Bounds-checks one plain object and its children. */
const validateObjectBounds = (value: unknown, depth: number): ImportValidationResult | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  for (const child of Object.values(value)) {
    const result = validateTreeBounds(child, depth + 1);
    if (result) return result;
  }
  return null;
};

/** Returns true when the value is a workflow wrapper that embeds a forecast. */
const isWorkflowWrapper = (candidate: { forecast?: unknown }): boolean =>
  candidate.forecast !== undefined && candidate.forecast !== null && typeof candidate.forecast === 'object';

/**
 * Validates a parsed forecast document before deserialization. This is the
 * single validator used by every forecast import entry point.
 * @param {unknown} data
 * @returns {ImportValidationResult}
 */
export const validateForecastImport = (data: unknown): ImportValidationResult => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return fail('Forecast file is not a valid object.');
  }

  const genericBounds = validateTreeBounds(data, 0);
  if (genericBounds) return genericBounds;

  const candidate = data as {
    forecastCycle?: unknown;
    outlooks?: unknown;
    forecast?: unknown;
  };

  // Workflow package wrapper: validate the embedded forecast payload.
  if (isWorkflowWrapper(candidate)) {
    return validateForecastImport(candidate.forecast);
  }

  // Legacy single-day format: outlooks maps live at the root.
  if (candidate.outlooks !== undefined) {
    return validateLegacyOutlooks(candidate.outlooks);
  }

  if (candidate.forecastCycle !== undefined) {
    return validateForecastCycle(candidate.forecastCycle);
  }

  return fail('Forecast file is missing forecastCycle or outlooks data.');
};

/** Validates the legacy single-day outlooks section. */
const validateLegacyOutlooks = (outlooks: unknown): ImportValidationResult => {
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

/** Validates the multi-day forecastCycle section of a saved document. */
const validateForecastCycle = (value: unknown): ImportValidationResult => {
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

/** Returns a failure when a day key is not an integer in the 1-8 range. */
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
