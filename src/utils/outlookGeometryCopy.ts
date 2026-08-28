import type { Feature } from 'geojson';
import type { DayType, OutlookType } from '../types/outlooks';
import { getAvailableProbabilities } from '../components/OutlookPanel/outlookPanelUtils';
import { cloneJsonValue } from '../store/cloneJsonValue';

export type ProbabilisticHazardType = 'tornado' | 'wind' | 'hail';
export type HazardGeometryCopyMode = 'replace';

export interface CopyOutlookGeometryOptions {
  sourceType: ProbabilisticHazardType;
  targetType: ProbabilisticHazardType;
  mode: HazardGeometryCopyMode;
  probabilityFilter?: string;
}

export interface CopyOutlookGeometryResult {
  copiedFeatureCount: number;
  copiedProbabilityKeys: string[];
}

export const PROBABILISTIC_HAZARD_TYPES: readonly ProbabilisticHazardType[] = [
  'tornado',
  'wind',
  'hail',
];

export function isProbabilisticHazardType(type: OutlookType): type is ProbabilisticHazardType {
  return (PROBABILISTIC_HAZARD_TYPES as readonly string[]).includes(type);
}

export function getCopyableProbabilityKeys(
  sourceType: ProbabilisticHazardType,
  targetType: ProbabilisticHazardType,
  day: DayType,
): string[] {
  const sourceKeys = getAvailableProbabilities(sourceType, day);
  const targetKeySet = new Set(getAvailableProbabilities(targetType, day));
  return sourceKeys.filter((key) => targetKeySet.has(key));
}

export function countOutlookMapFeatures(map?: Map<string, Feature[]>): number {
  if (!map) {
    return 0;
  }

  let total = 0;
  map.forEach((features) => {
    total += features.length;
  });
  return total;
}

interface CountCopyableSourceFeaturesOptions {
  sourceMap: Map<string, Feature[]> | undefined;
  sourceType: ProbabilisticHazardType;
  targetType: ProbabilisticHazardType;
  day: DayType;
  probabilityFilter?: string;
}

export function countCopyableSourceFeatures(
  options: CountCopyableSourceFeaturesOptions,
): number {
  const { sourceMap, sourceType, targetType, day, probabilityFilter } = options;
  if (!sourceMap) {
    return 0;
  }

  const keys = probabilityFilter
    ? getCopyableProbabilityKeys(sourceType, targetType, day).filter((key) => key === probabilityFilter)
    : getCopyableProbabilityKeys(sourceType, targetType, day);

  return keys.reduce((sum, key) => sum + (sourceMap.get(key)?.length ?? 0), 0);
}

export function cloneGeometryAsFeature(
  source: Feature,
  targetType: ProbabilisticHazardType,
  targetProbability: string,
  sourceIndex = 0,
): Feature {
  const sourceOutlookType = source.properties?.outlookType;
  const sourceId = typeof source.id === 'string' || typeof source.id === 'number'
    ? source.id
    : 'anonymous';
  return {
    type: 'Feature',
    id: `geometry-copy:${sourceId}:${targetType}:${targetProbability}:${sourceIndex}`,
    geometry: cloneJsonValue(source.geometry),
    properties: {
      outlookType: targetType,
      probability: targetProbability,
      isSignificant: false,
      derivedFrom: `geometry-copy:${typeof sourceOutlookType === 'string' ? sourceOutlookType : 'unknown'}`,
    },
  };
}

export function copyOutlookGeometry(
  sourceMap: Map<string, Feature[]>,
  targetMap: Map<string, Feature[]>,
  options: CopyOutlookGeometryOptions,
  day: DayType,
): CopyOutlookGeometryResult {
  const { sourceType, targetType, probabilityFilter } = options;
  const keys = probabilityFilter
    ? getCopyableProbabilityKeys(sourceType, targetType, day).filter((key) => key === probabilityFilter)
    : getCopyableProbabilityKeys(sourceType, targetType, day);

  if (!probabilityFilter) {
    targetMap.clear();
  }

  let copiedFeatureCount = 0;
  const copiedProbabilityKeys: string[] = [];

  for (const key of keys) {
    const sourceFeatures = sourceMap.get(key);
    if (!sourceFeatures?.length) {
      continue;
    }

    const cloned = sourceFeatures.map((feature, index) =>
      cloneGeometryAsFeature(feature, targetType, key, index),
    );

    targetMap.set(key, cloned);

    copiedFeatureCount += cloned.length;
    copiedProbabilityKeys.push(key);
  }

  return { copiedFeatureCount, copiedProbabilityKeys };
}
