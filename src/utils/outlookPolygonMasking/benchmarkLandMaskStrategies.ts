import * as turf from '@turf/turf';
import { buildLandMask } from './buildLandMask';
import { clipOutlookToLandMask } from './clipOutlookPolygon';
import { loadVendoredBoundaryGeoBundle } from './loadVendoredBoundaryGeoBundle';
import type { LandMaskStrategy } from './types';

export interface StrategyBenchmark {
  strategy: LandMaskStrategy;
  buildDurationMs: number;
  gulfRemovedAreaRatio: number;
  inlandRetainedAreaRatio: number;
}

/**
 * Runs the three prototype land-mask strategies against vendored datasets.
 * Intended for Jest benchmarks and manual investigation, not production UI.
 */
export const benchmarkLandMaskStrategies = (): StrategyBenchmark[] => {
  const boundaries = loadVendoredBoundaryGeoBundle();
  const strategies: LandMaskStrategy[] = [
    'us-country',
    'us-country-minus-great-lakes',
    'us-states-union',
  ];

  const gulfOutlook = turf.polygon([
    [
      [-90, 28],
      [-88, 28],
      [-88, 30],
      [-90, 30],
      [-90, 28],
    ],
  ]);

  const inlandOutlook = turf.polygon([
    [
      [-97, 35],
      [-96, 35],
      [-96, 36],
      [-97, 36],
      [-97, 35],
    ],
  ]);

  return strategies.map((strategy) => {
    const start = performance.now();
    const landMask = buildLandMask(strategy, boundaries);
    const buildDurationMs = performance.now() - start;

    if (!landMask) {
      return {
        strategy,
        buildDurationMs,
        gulfRemovedAreaRatio: 1,
        inlandRetainedAreaRatio: 0,
      };
    }

    const gulfClip = clipOutlookToLandMask(gulfOutlook, landMask, strategy);
    const inlandClip = clipOutlookToLandMask(inlandOutlook, landMask, strategy);
    const inlandArea = turf.area(inlandOutlook);
    const inlandRetainedAreaRatio =
      inlandClip.feature && inlandArea > 0
        ? turf.area(inlandClip.feature) / inlandArea
        : 0;

    return {
      strategy,
      buildDurationMs,
      gulfRemovedAreaRatio: gulfClip.removedAreaRatio,
      inlandRetainedAreaRatio,
    };
  });
};
