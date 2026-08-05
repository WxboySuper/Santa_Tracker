import {
  MAX_ARRAY_ITEMS,
  MAX_IMPORT_BYTES,
  MAX_NESTING_DEPTH,
  MAX_STRING_LENGTH,
  fail,
  type ImportValidationResult,
} from './forecastValidationTypes';
import { validateForecastCycle, validateLegacyOutlooks } from './forecastOutlookValidation';

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

/** Bounds-check the raw import file bytes before parsing. */
export const validateImportFileBytes = (bytes: Uint8Array | ArrayBuffer | undefined | null): ImportValidationResult => {
  if (bytes == null) return { ok: true };
  const byteLength = bytes.byteLength;
  if (byteLength > MAX_IMPORT_BYTES) {
    return fail(`File is too large (${(byteLength / 1024 / 1024).toFixed(1)} MB); the maximum supported size is ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`);
  }
  return { ok: true };
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
// @codescene(disable:"Complex Conditional")
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

export type { ImportValidationResult };
export { MAX_IMPORT_BYTES };
