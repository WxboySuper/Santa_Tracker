import type { Feature } from 'geojson';
import type { OutlookType } from '../../types/outlooks';
import {
  type PaintBucketEditAction,
  type PaintBucketEditRequest,
  type PaintBucketEditResult,
} from './types';

/** Computes the destination probability for a paint-bucket action. */
export const resolveTargetProbability = (
  action: PaintBucketEditAction,
  fromProbability: string,
  activeProbability: string,
  probabilityList: readonly string[],
): string | null => {
  const currentIndex = probabilityList.indexOf(fromProbability);

  switch (action) {
    case 'recategorize':
      return fromProbability === activeProbability ? null : activeProbability;
    case 'step-up':
      return resolveAdjacentProbability(probabilityList, currentIndex, 1);
    case 'step-down':
      return resolveAdjacentProbability(probabilityList, currentIndex, -1);
    default:
      return null;
  }
};

/**
 * Returns the adjacent entry in the ordered brush list. The list deliberately
 * contains ordinary probabilities followed by CIG levels, so stepping at a
 * boundary changes the feature's classification instead of stopping there.
 */
const resolveAdjacentProbability = (
  probabilityList: readonly string[],
  currentIndex: number,
  offset: -1 | 1,
): string | null => {
  if (currentIndex === -1) return null;
  return probabilityList[currentIndex + offset] ?? null;
};

const cloneOutlookMap = (outlookMap: Map<string, Feature[]>): Map<string, Feature[]> => {
  const cloned = new Map<string, Feature[]>();
  outlookMap.forEach((features, key) => {
    cloned.set(key, features.map((feature) => ({
      ...feature,
      properties: feature.properties ? { ...feature.properties } : feature.properties,
    })));
  });
  return cloned;
};

const setMapEntry = (
  map: Map<string, Feature[]>,
  key: string,
  features: Feature[],
): void => {
  if (features.length > 0) {
    map.set(key, features);
    return;
  }
  map.delete(key);
};

const findFeatureLocation = (
  outlookMap: Map<string, Feature[]>,
  featureId: string,
  preferredProbability?: string,
): { fromProbability: string; feature: Feature } | null => {
  const normalizedFeatureId = String(featureId);
  const searchOrder = preferredProbability
    ? [preferredProbability, ...Array.from(outlookMap.keys()).filter((key) => key !== preferredProbability)]
    : Array.from(outlookMap.keys());

  for (const probability of searchOrder) {
    const features = outlookMap.get(probability);
    const feature = features?.find((item) => String(item.id) === normalizedFeatureId);
    if (feature) {
      return { fromProbability: probability, feature };
    }
  }

  return null;
};

/** Applies a paint-bucket action to one feature within an outlook probability map. */
export const applyPaintBucketStrategy = (
  outlookMap: Map<string, Feature[]>,
  request: PaintBucketEditRequest,
): PaintBucketEditResult => {
  const located = findFeatureLocation(
    outlookMap,
    request.featureId,
    request.fromProbability,
  );
  if (!located) {
    return { changed: false, map: outlookMap };
  }

  const { fromProbability, feature } = located;
  const targetProbability = resolveTargetProbability(
    request.action,
    fromProbability,
    request.activeProbability,
    request.probabilityList,
  );

  if (!targetProbability) {
    return { changed: false, map: outlookMap };
  }

  const nextMap = cloneOutlookMap(outlookMap);
  const remainingSource = (nextMap.get(fromProbability) ?? []).filter(
    (item) => String(item.id) !== String(request.featureId),
  );
  setMapEntry(nextMap, fromProbability, remainingSource);

  const outlookType = (feature.properties?.outlookType as OutlookType) || request.outlookType;
  const movedFeature: Feature = {
    ...feature,
    properties: {
      ...feature.properties,
      outlookType,
      probability: targetProbability,
    },
  };

  const targetFeatures = nextMap.get(targetProbability) ?? [];
  nextMap.set(targetProbability, [...targetFeatures, movedFeature]);

  return {
    changed: true,
    targetProbability,
    map: nextMap,
  };
};
