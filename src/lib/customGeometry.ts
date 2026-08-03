import type { Geometry, Position } from 'geojson';
import {
  CUSTOM_PRODUCT_LIMITS,
} from '../types/customProducts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isPosition = (value: unknown): value is Position => {
  if (!Array.isArray(value)) return false;
  if (![2, 3].includes(value.length)) return false;
  return value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate));
};

const isLinearRing = (value: unknown): value is Position[] => {
  if (!Array.isArray(value)) return false;
  if (value.length < 4) return false;
  if (!value.every(isPosition)) return false;
  const first = value[0];
  const last = value[value.length - 1];
  if (first.length !== last.length) return false;
  return first.every((coordinate, index) => coordinate === last[index]);
};

const isPolygonCoordinates = (value: unknown): value is Position[][] => {
  if (!Array.isArray(value)) return false;
  if (value.length === 0 || value.length > CUSTOM_PRODUCT_LIMITS.ringsPerPolygon) return false;
  return value.every(isLinearRing);
};

const getGeometryPositions = (value: Record<string, unknown>): Position[] => {
  if (!Array.isArray(value.coordinates)) return [];
  const polygons = value.type === 'Polygon' ? [value.coordinates] : value.coordinates;
  return (polygons as Position[][][]).flat(2);
};

const hasValidGeometryDimensions = (value: Record<string, unknown>): boolean => {
  const positions = getGeometryPositions(value);
  if (positions.length === 0 || positions.length > CUSTOM_PRODUCT_LIMITS.coordinatesPerFeature) return false;
  return positions.every((position) => position.length === positions[0].length);
};

const hasValidPolygonGeometry = (value: Record<string, unknown>): boolean => {
  if (value.type !== 'Polygon') return false;
  if (!isPolygonCoordinates(value.coordinates)) return false;
  return hasValidGeometryDimensions(value);
};

const hasValidMultiPolygonGeometry = (value: Record<string, unknown>): boolean => {
  if (value.type !== 'MultiPolygon' || !Array.isArray(value.coordinates)) return false;
  if (value.coordinates.length === 0) return false;
  if (value.coordinates.length > CUSTOM_PRODUCT_LIMITS.polygonsPerFeature) return false;
  if (!value.coordinates.every(isPolygonCoordinates)) return false;
  return hasValidGeometryDimensions(value);
};

export const isCustomPolygonGeometry = (value: unknown): value is Geometry => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['type', 'coordinates'])) return false;
  return hasValidPolygonGeometry(value) || hasValidMultiPolygonGeometry(value);
};

export const getCustomGeometryDimension = (value: Geometry): number =>
  getGeometryPositions(value as unknown as Record<string, unknown>)[0]?.length ?? 0;
