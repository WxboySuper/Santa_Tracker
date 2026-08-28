import * as turf from '@turf/turf';
import type { FeatureCollection } from 'geojson';
import { CONUS_BBOX, GREAT_LAKE_NAMES } from './constants';
import type { LandMaskFeature } from './types';

const US_ADMIN_NAMES = new Set([
  'United States of America',
  'United States',
]);

/** Finds the United States country feature inside a Natural Earth countries collection. */
export const findUnitedStatesCountry = (
  countries: FeatureCollection,
): LandMaskFeature | null => {
  const match = countries.features.find((feature) => {
    const props = feature.properties as Record<string, unknown> | null;
    const admin = props?.ADMIN ?? props?.NAME ?? props?.name;
    return typeof admin === 'string' && US_ADMIN_NAMES.has(admin);
  });

  if (!match?.geometry) {
    return null;
  }

  return match as LandMaskFeature;
};

/** Returns lake polygons whose bounding boxes overlap the CONUS envelope. */
export const findConusLakes = (lakes: FeatureCollection): LandMaskFeature[] =>
  lakes.features.filter((feature) => {
    const [minX, minY, maxX, maxY] = turf.bbox(feature);
    const [west, south, east, north] = CONUS_BBOX;
    return maxX > west && minX < east && maxY > south && minY < north;
  }) as LandMaskFeature[];

/** Filters CONUS-overlapping lakes down to the Great Lakes subset. */
export const findGreatLakes = (lakes: FeatureCollection): LandMaskFeature[] => {
  const names = new Set<string>(GREAT_LAKE_NAMES);
  return findConusLakes(lakes).filter((feature) => {
    const props = feature.properties as Record<string, unknown> | null;
    const name = props?.name;
    return typeof name === 'string' && names.has(name);
  });
};

/** Unions polygon features sequentially; throws when Turf cannot produce geometry. */
export const unionPolygonFeatures = (
  features: LandMaskFeature[],
): LandMaskFeature | null => {
  if (features.length === 0) {
    return null;
  }

  let current = features[0];
  for (let index = 1; index < features.length; index += 1) {
    const next = turf.union(turf.featureCollection([current, features[index]]));
    if (!next) {
      throw new Error(`Union failed while merging feature index ${index}.`);
    }
    current = next as LandMaskFeature;
  }

  return current;
};

/** Subtracts water polygons from a land mask using Turf difference. */
export const subtractPolygons = (
  land: LandMaskFeature,
  waterFeatures: LandMaskFeature[],
): LandMaskFeature => {
  let current = land;
  for (const water of waterFeatures) {
    const result = turf.difference(turf.featureCollection([current, water]));
    if (!result) {
      throw new Error('Difference removed the entire land mask.');
    }
    current = result as LandMaskFeature;
  }
  return current;
};
