import type { BoundaryGeoBundle, LandMaskFeature, LandMaskStrategy } from './types';
import {
  findGreatLakes,
  findUnitedStatesCountry,
  subtractPolygons,
  unionPolygonFeatures,
} from './geoBoundaryFeatures';

/**
 * Builds a reusable land mask for prototype clipping workflows.
 *
 * This is intentionally isolated from map rendering so we can benchmark strategies
 * before wiring UI. Production should cache the chosen mask once per session.
 */
export const buildLandMask = (
  strategy: LandMaskStrategy,
  boundaries: BoundaryGeoBundle,
): LandMaskFeature | null => {
  switch (strategy) {
    case 'us-states-union':
      return unionPolygonFeatures(boundaries.states.features as LandMaskFeature[]);

    case 'us-country':
      return findUnitedStatesCountry(boundaries.countries);

    case 'us-country-minus-great-lakes': {
      const country = findUnitedStatesCountry(boundaries.countries);
      if (!country) {
        return null;
      }
      const greatLakes = findGreatLakes(boundaries.lakes);
      if (greatLakes.length === 0) {
        return country;
      }
      return subtractPolygons(country, greatLakes);
    }

    default:
      return null;
  }
};
