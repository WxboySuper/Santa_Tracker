import { buildLandMask } from './buildLandMask';
import { fetchBoundaryGeoBundle } from './fetchBoundaryGeoBundle';
import type { LandMaskFeature, LandMaskStrategy } from './types';

let cachedStrategy: LandMaskStrategy | null = null;
let cachedLandMask: LandMaskFeature | null = null;
const inflightByStrategy = new Map<LandMaskStrategy, Promise<LandMaskFeature | null>>();
let runtimeGeneration = 0;

/** Clears the in-memory land mask cache (tests and strategy changes). */
export const clearLandMaskRuntimeCache = (): void => {
  cachedStrategy = null;
  cachedLandMask = null;
  runtimeGeneration += 1;
  inflightByStrategy.clear();
};

/** Returns the cached land mask when it matches the requested strategy. */
export const getCachedLandMask = (strategy: LandMaskStrategy): LandMaskFeature | null => {
  if (cachedStrategy === strategy && cachedLandMask) {
    return cachedLandMask;
  }
  return null;
};

/** Loads and caches a land mask for the requested strategy. */
export const ensureLandMask = async (
  strategy: LandMaskStrategy,
): Promise<LandMaskFeature | null> => {
  const cached = getCachedLandMask(strategy);
  if (cached) {
    return cached;
  }

  const inflight = inflightByStrategy.get(strategy);
  if (inflight) {
    return inflight;
  }

  const generation = runtimeGeneration;
  const request = fetchBoundaryGeoBundle()
    .then((boundaries) => buildLandMask(strategy, boundaries))
    .then((mask) => {
      if (generation === runtimeGeneration) {
        cachedStrategy = strategy;
        cachedLandMask = mask;
      }
      inflightByStrategy.delete(strategy);
      return mask;
    })
    .catch((error) => {
      inflightByStrategy.delete(strategy);
      throw error;
    });

  inflightByStrategy.set(strategy, request);
  return request;
};
