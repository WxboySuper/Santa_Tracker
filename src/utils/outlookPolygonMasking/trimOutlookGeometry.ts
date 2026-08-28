import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { clipOutlookToLandMask } from './clipOutlookPolygon';
import type { LandMaskFeature, LandMaskStrategy } from './types';

export interface TrimOutlookGeometryResult {
  geometry: Polygon | MultiPolygon | null;
  removedAreaRatio: number;
  error?: string;
}

/** Clips one outlook geometry to a land mask. A null geometry is a valid empty intersection. */
export const trimOutlookGeometry = (
  geometry: Polygon | MultiPolygon,
  landMask: LandMaskFeature,
  strategy: LandMaskStrategy,
): TrimOutlookGeometryResult => {
  const feature: Feature<Polygon | MultiPolygon> = {
    type: 'Feature',
    properties: {},
    geometry,
  };

  try {
    const clipped = clipOutlookToLandMask(feature, landMask, strategy);
    if (!clipped.feature) {
      return {
        geometry: null,
        removedAreaRatio: clipped.removedAreaRatio,
      };
    }

    return {
      geometry: clipped.feature.geometry,
      removedAreaRatio: clipped.removedAreaRatio,
    };
  } catch (error) {
    return {
      geometry: geometry,
      removedAreaRatio: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/** Returns true when a trimmed polygon is effectively empty. */
export const isTrimmedGeometryEmpty = (geometry: Polygon | MultiPolygon | null): boolean => {
  if (!geometry) {
    return true;
  }
  return turf.area({ type: 'Feature', properties: {}, geometry }) <= 1;
};
