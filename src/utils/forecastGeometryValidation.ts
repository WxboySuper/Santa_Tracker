import type { Feature, Geometry } from 'geojson';
import type { ImportValidationResult } from './forecastValidationTypes';
import { MAX_ARRAY_ITEMS, fail } from './forecastValidationTypes';

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

/** Returns true when a numeric coordinate position is non-finite (NaN or Infinity). */
const isNonFinitePosition = (item: unknown): boolean =>
  typeof item === 'number' && !Number.isFinite(item);

/** Returns true when any item in a coordinate leaf is non-finite. */
const leafHasNonFinite = (leaf: unknown[]): boolean => leaf.some(isNonFinitePosition);

/** Recursively walks a nested coordinate tree, counting positions and non-finite values. */
const walkCoordinates = (
  value: unknown,
  limit: number,
  state: { count: number; hasNonFinite: boolean },
): void => {
  if (state.count >= limit) return;
  if (!Array.isArray(value)) return;

  if (value.length > 0 && Array.isArray(value[0])) {
    value.forEach((child) => walkCoordinates(child, limit, state));
    return;
  }

  if (!state.hasNonFinite && leafHasNonFinite(value)) {
    state.hasNonFinite = true;
  }
  state.count += value.length;
};

/**
 * Counts coordinate positions inside a GeoJSON geometry, bounding work early
 * when the limit is exceeded, and reports whether any position is non-finite.
 */
const countCoordinatePositions = (geometry: Geometry, limit: number): { count: number; hasNonFinite: boolean } => {
  if (geometry.type === 'GeometryCollection') {
    return { count: 0, hasNonFinite: false };
  }
  const state = { count: 0, hasNonFinite: false };
  walkCoordinates((geometry as { coordinates?: unknown }).coordinates, limit, state);
  return state;
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
  const { count, hasNonFinite } = countCoordinatePositions(geometry as Geometry, MAX_COORDINATE_POSITIONS);
  if (count >= MAX_COORDINATE_POSITIONS) {
    return fail('Forecast geometry contains too many coordinates.');
  }
  if (hasNonFinite) {
    return fail('Forecast geometry contains a non-finite coordinate.');
  }
  return null;
};

/** Validates one GeoJSON geometry object against supported types and coordinate bounds. */
// @codescene(disable:"Complex Conditional")
export const validateGeometry = (value: unknown): ImportValidationResult | null => {
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
// @codescene(disable:"Complex Method", disable:"Complex Conditional")
export const validateFeature = (value: unknown): ImportValidationResult | null => {
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
