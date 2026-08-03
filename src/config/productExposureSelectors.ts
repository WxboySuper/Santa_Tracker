import { type BuildTarget, getBuildTarget } from './buildTarget';
import { isFeatureExposedOnTarget, type FeatureKey } from './featureExposure';
import type { OutlookType } from '../types/outlooks';

const OUTLOOK_EXPOSURE_BY_TYPE = {
  tornado: 'tornadoOutlook',
  wind: 'windOutlook',
  hail: 'hailOutlook',
  categorical: 'categoricalOutlook',
} as const satisfies Partial<Record<OutlookType, FeatureKey>>;

type OutlookExposureFeatureKey = (typeof OUTLOOK_EXPOSURE_BY_TYPE)[keyof typeof OUTLOOK_EXPOSURE_BY_TYPE];

const OUTLOOK_TYPE_BY_FEATURE = {
  tornadoOutlook: 'tornado',
  windOutlook: 'wind',
  hailOutlook: 'hail',
  categoricalOutlook: 'categorical',
} as const satisfies Record<OutlookExposureFeatureKey, keyof typeof OUTLOOK_EXPOSURE_BY_TYPE>;

const OUTLOOK_EXPOSURE_PRIORITY = [
  'tornadoOutlook',
  'windOutlook',
  'hailOutlook',
  'categoricalOutlook',
] as const satisfies readonly OutlookExposureFeatureKey[];

/** Returns whether map export is exposed on the current build target. */
export const isExportMapExposed = (target: BuildTarget = getBuildTarget()): boolean =>
  isFeatureExposedOnTarget('exportMap', target);

/** Returns whether forecast save/load is exposed on the current build target. */
export const isSaveLoadExposed = (target: BuildTarget = getBuildTarget()): boolean =>
  isFeatureExposedOnTarget('saveLoad', target);

/** Returns whether significant-threat labels are exposed on the current build target. */
export const isSignificantThreatsExposed = (target: BuildTarget = getBuildTarget()): boolean =>
  isFeatureExposedOnTarget('significantThreats', target);

/** Returns whether a Day 1/2 outlook type is exposed for the current build target. */
export const isOutlookTypeExposed = (
  type: OutlookType,
  target: BuildTarget = getBuildTarget()
): boolean => {
  const feature = OUTLOOK_EXPOSURE_BY_TYPE[type as keyof typeof OUTLOOK_EXPOSURE_BY_TYPE];
  if (!feature) {
    return type === 'totalSevere' || type === 'day4-8';
  }

  return isFeatureExposedOnTarget(feature, target);
};

/** Returns whether any Day 1/2 outlook type is exposed for the current build target. */
export const isAnyOutlookExposed = (target: BuildTarget = getBuildTarget()): boolean =>
  OUTLOOK_EXPOSURE_PRIORITY.some((feature) => isFeatureExposedOnTarget(feature, target));

/**
 * Returns the first exposed Day 1/2 outlook type for the current build target.
 * Falls back to categorical when every outlook is disabled so emergency mode can render.
 */
export const getFirstExposedOutlookType = (target: BuildTarget = getBuildTarget()): OutlookType => {
  for (const feature of OUTLOOK_EXPOSURE_PRIORITY) {
    if (isFeatureExposedOnTarget(feature, target)) {
      return OUTLOOK_TYPE_BY_FEATURE[feature];
    }
  }

  return 'categorical';
};

/** Returns whether emergency mode should be active because every outlook is disabled. */
export const shouldActivateEmergencyMode = (target: BuildTarget = getBuildTarget()): boolean =>
  !isAnyOutlookExposed(target);
