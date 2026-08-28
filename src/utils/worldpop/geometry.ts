import { featureCollection, union } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { WorldPopGeometry } from './client';

/** Returns the drawable polygon geometry from a GeoJSON feature, if present. */
const getPolygonGeometry = (feature: Feature): WorldPopGeometry | null => {
  if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
    return feature.geometry;
  }
  return null;
};

/** Unions forecast polygons into one geometry so overlapping risk areas count residents once. */
export const unionForecastPolygons = (features: Feature[]): WorldPopGeometry | null => {
  const polygons = features
    .map(getPolygonGeometry)
    .filter((geometry): geometry is Polygon | MultiPolygon => geometry !== null)
    .map((geometry) => ({ type: 'Feature' as const, properties: {}, geometry }));

  if (polygons.length === 0) return null;
  if (polygons.length === 1) return polygons[0].geometry;

  const merged = union(featureCollection(polygons));
  return merged?.geometry ?? null;
};
