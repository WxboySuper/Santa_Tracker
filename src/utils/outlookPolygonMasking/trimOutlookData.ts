import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { OutlookData, OutlookType } from '../../types/outlooks';
import type { LandMaskFeature, LandMaskStrategy } from './types';
import { isTrimmedGeometryEmpty, trimOutlookGeometry } from './trimOutlookGeometry';

export interface TrimOutlookDataResult {
  trimmedCount: number;
  removedCount: number;
  failedCount: number;
  skippedCount: number;
  errors: string[];
}

const shouldSkipOutlookFeature = (feature: Feature): boolean => {
  const outlookType = feature.properties?.outlookType as OutlookType | undefined;
  const derivedFrom = feature.properties?.derivedFrom;
  return outlookType === 'categorical' && derivedFrom === 'auto-generated';
};

/**
 * Mutates outlook maps in place for one day's data.
 * Skips auto-generated categorical polygons.
 */
// @codescene(disable:"Complex Method")
export const trimOutlookDataInPlace = (
  outlookData: OutlookData,
  landMask: LandMaskFeature,
  strategy: LandMaskStrategy,
): TrimOutlookDataResult => {
  const result: TrimOutlookDataResult = {
    trimmedCount: 0,
    removedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  (Object.keys(outlookData) as OutlookType[]).forEach((outlookType) => {
    const outlookMap = outlookData[outlookType];
    if (!outlookMap) {
      return;
    }

    outlookMap.forEach((features, probability) => {
      const nextFeatures: Feature[] = [];

      features.forEach((feature) => {
        if (shouldSkipOutlookFeature(feature)) {
          result.skippedCount += 1;
          nextFeatures.push(feature);
          return;
        }

        const geometry = feature.geometry as Polygon | MultiPolygon;
        if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
          nextFeatures.push(feature);
          return;
        }

        const trimmed = trimOutlookGeometry(geometry, landMask, strategy);
        if (trimmed.error) {
          result.failedCount += 1;
          if (result.errors.length < 5) {
            result.errors.push(trimmed.error);
          }
          nextFeatures.push(feature);
          return;
        }

        if (isTrimmedGeometryEmpty(trimmed.geometry)) {
          result.removedCount += 1;
          return;
        }

        if (trimmed.removedAreaRatio > 0.001) {
          result.trimmedCount += 1;
        }

        nextFeatures.push({
          ...feature,
          geometry: trimmed.geometry!,
        });
      });

      if (nextFeatures.length > 0) {
        outlookMap.set(probability, nextFeatures);
      } else {
        outlookMap.delete(probability);
      }
    });
  });

  return result;
};

/** Builds trimmed copies for preview rendering without mutating source data. */
export const buildTrimmedOutlookPreviewFeatures = (
  outlookData: OutlookData,
  landMask: LandMaskFeature,
  strategy: LandMaskStrategy,
): Feature[] => {
  const previewFeatures: Feature[] = [];

  (Object.keys(outlookData) as OutlookType[]).forEach((outlookType) => {
    const outlookMap = outlookData[outlookType];
    if (!outlookMap) {
      return;
    }

    outlookMap.forEach((features) => {
      features.forEach((feature) => {
        if (shouldSkipOutlookFeature(feature)) {
          return;
        }

        const geometry = feature.geometry as Polygon | MultiPolygon;
        if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
          return;
        }

        const trimmed = trimOutlookGeometry(geometry, landMask, strategy);
        if (!trimmed.geometry || isTrimmedGeometryEmpty(trimmed.geometry)) {
          return;
        }

        previewFeatures.push({
          ...feature,
          id: `trim-preview:${String(feature.id ?? outlookType)}`,
          geometry: trimmed.geometry,
          properties: {
            ...feature.properties,
            trimPreview: true,
          },
        });
      });
    });
  });

  return previewFeatures;
};
