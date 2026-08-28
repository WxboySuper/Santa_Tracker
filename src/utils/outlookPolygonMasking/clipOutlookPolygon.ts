import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { ClipOutlookResult, LandMaskFeature, LandMaskStrategy } from './types';

type OutlookFeature = Feature<Polygon | MultiPolygon>;

/**
 * Prototype A — geometry mutation path: intersect an outlook polygon with a land mask.
 * Persist the returned geometry when `MaskPersistence` is `mutate-geometry`.
 */
export const clipOutlookToLandMask = (
  outlook: OutlookFeature,
  landMask: LandMaskFeature,
  strategy: LandMaskStrategy,
): ClipOutlookResult => {
  const originalArea = turf.area(outlook);
  if (originalArea <= 0) {
    return { feature: null, removedAreaRatio: 1, strategy };
  }

  const clipped = turf.intersect(turf.featureCollection([outlook, landMask]));
  if (!clipped) {
    return { feature: null, removedAreaRatio: 1, strategy };
  }

  const cleaned = turf.cleanCoords(clipped) as LandMaskFeature;
  const clippedArea = turf.area(cleaned);
  const removedAreaRatio = Math.max(0, Math.min(1, 1 - clippedArea / originalArea));

  return {
    feature: cleaned,
    removedAreaRatio,
    strategy,
  };
};

/**
 * Prototype B — preview-only path: same math as clipOutlookToLandMask but documented
 * as a non-persisted render/export preview helper. Callers should not dispatch Redux
 * updates when using this for `render-only` experiments.
 */
export const previewClipOutlookToLandMask = clipOutlookToLandMask;
