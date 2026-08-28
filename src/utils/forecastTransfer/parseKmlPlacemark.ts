import type { DayType, OutlookType } from '../../types/outlooks';
import { geometryFromKmlElement } from './kmlGeometry';
import type { ParsedKmlPlacemark } from './types';
import {
  findKmlElementsByLocalName,
  getExtendedDataValue,
  type FolderContext,
  normalizeProbabilityKey,
  OUTLOOK_TYPES,
  parsePlacemarkName,
} from './parseKmlPlacemarkHelpers';

// @codescene(disable:"Complex Method", disable:"Complex Conditional", disable:"Overall Code Complexity", disable:"String Heavy Function Arguments")
export const parseKmlPlacemark = (
  placemark: Element,
  context: FolderContext,
  warnings: string[],
): ParsedKmlPlacemark | null => {
  const geometryContainer = findKmlElementsByLocalName(placemark, 'polygon')[0]
    ?? findKmlElementsByLocalName(placemark, 'multigeometry')[0]
    ?? placemark;
  const feature = geometryFromKmlElement(geometryContainer);
  if (!feature) {
    warnings.push('Skipped placemark without polygon geometry.');
    return null;
  }

  const extendedDay = Number(getExtendedDataValue(placemark, 'gfc_day') ?? context.day);
  const day = (extendedDay >= 1 && extendedDay <= 8 ? extendedDay : context.day) as DayType;
  const extendedOutlook = getExtendedDataValue(placemark, 'gfc_outlook_type') as OutlookType | null;
  const outlookFromName = parsePlacemarkName(placemark.getElementsByTagName('name')[0]?.textContent ?? '');
  const outlookType = extendedOutlook && OUTLOOK_TYPES.has(extendedOutlook)
    ? extendedOutlook
    : context.outlookType ?? outlookFromName.outlookType;
  if (!outlookType) {
    warnings.push('Skipped placemark with unknown outlook type.');
    return null;
  }

  const extendedProbability = getExtendedDataValue(placemark, 'gfc_probability_key');
  const probabilityKey = normalizeProbabilityKey(
    extendedProbability ?? outlookFromName.probabilityKey ?? 'UNKNOWN',
    getExtendedDataValue(placemark, 'gfc_significant') === 'true',
  );
  if (probabilityKey === 'UNKNOWN') {
    warnings.push(`Skipped placemark on day ${day} without a probability key.`);
    return null;
  }

  const isSignificant = getExtendedDataValue(placemark, 'gfc_significant') === 'true'
    || probabilityKey.includes('#');
  return {
    day,
    outlookType,
    probabilityKey,
    feature: {
      ...feature,
      properties: { outlookType, probability: probabilityKey, isSignificant },
    },
    isSignificant,
  };
};
