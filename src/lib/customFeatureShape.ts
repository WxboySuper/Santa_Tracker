import { getCustomGeometryDimension, isCustomPolygonGeometry } from './customGeometry';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isBoundingBox = (value: unknown, dimension: number): boolean => {
  if (!Array.isArray(value) || value.length !== dimension * 2) return false;
  if (!value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) return false;
  return value.slice(0, dimension).every((minimum, index) => minimum <= value[index + dimension]);
};

const isOptionalFeatureId = (value: unknown): boolean => {
  if (value === undefined || typeof value === 'string') return true;
  return typeof value === 'number' && Number.isFinite(value);
};

export const hasValidCustomFeatureShape = (value: Record<string, unknown>): boolean => {
  if (!hasOnlyKeys(value, ['type', 'id', 'geometry', 'properties', 'bbox'])) return false;
  if (value.type !== 'Feature' || !isCustomPolygonGeometry(value.geometry)) return false;
  if (!isRecord(value.properties) || !isOptionalFeatureId(value.id)) return false;
  if (value.bbox === undefined) return true;
  return isBoundingBox(value.bbox, getCustomGeometryDimension(value.geometry));
};
