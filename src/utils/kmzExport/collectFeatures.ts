import type { DayType, ForecastCycle, OutlookType } from '../../types/outlooks';
import { colorMappings, getOutlookColor, isSignificantThreat } from '../outlookUtils';
import { geometryToKml } from './geometry';
import type { KmzExportFeature, KmzExportInput, KmzExportOptions } from './types';

const OUTLOOK_ORDER: OutlookType[] = ['categorical', 'tornado', 'wind', 'hail', 'totalSevere', 'day4-8'];

const OUTLOOK_LABELS: Record<OutlookType, string> = {
  categorical: 'Categorical',
  tornado: 'Tornado',
  wind: 'Wind',
  hail: 'Hail',
  totalSevere: 'Total Severe',
  'day4-8': 'Day 4-8',
};

const isCigKey = (probabilityKey: string): boolean => probabilityKey.startsWith('CIG');

const normalizeProbabilityForColor = (probabilityKey: string): string =>
  probabilityKey.replace(/#/g, '%');

const resolveFeatureColor = (outlookType: OutlookType, probabilityKey: string): string =>
  isCigKey(probabilityKey)
    ? colorMappings.significant
    : getOutlookColor({ outlookType, probability: normalizeProbabilityForColor(probabilityKey) });

const resolveDays = (forecastCycle: ForecastCycle, options: KmzExportOptions): DayType[] => {
  if (options.scope === 'cycle') {
    return (Object.keys(forecastCycle.days) as unknown as DayType[])
      .map((day) => Number(day) as DayType)
      .filter((day) => forecastCycle.days[day])
      .sort((a, b) => a - b);
  }

  const day = options.day ?? forecastCycle.currentDay;
  return forecastCycle.days[day] ? [day] : [];
};

const resolveOutlookTypes = (options: KmzExportOptions): OutlookType[] => {
  if (options.outlookTypes && options.outlookTypes.length > 0) {
    return OUTLOOK_ORDER.filter((outlookType) => options.outlookTypes?.includes(outlookType));
  }

  return [...OUTLOOK_ORDER];
};

const defaultFillOpacity = (probabilityKey: string): number => (isCigKey(probabilityKey) ? 0.15 : 0.66);

const collectProbabilityFeatures = (
  day: DayType,
  outlookType: OutlookType,
  probabilityKey: string,
  dayFeatures: KmzExportFeature['feature'][],
  configuredOpacity: number | undefined,
): KmzExportFeature[] => {
  const isCig = isCigKey(probabilityKey);
  const isSignificant = isSignificantThreat({ probability: probabilityKey })
    || dayFeatures.some((feature) => feature.properties?.isSignificant === true);
  const fillOpacity = typeof configuredOpacity === 'number'
    ? Math.min(1, Math.max(0, configuredOpacity))
    : defaultFillOpacity(probabilityKey);

  return dayFeatures.flatMap((feature, featureIndex) => geometryToKml(feature.geometry) ? [{
    day,
    outlookType,
    probabilityKey,
    featureIndex,
    feature,
    fillColor: resolveFeatureColor(outlookType, probabilityKey),
    fillOpacity,
    strokeColor: isSignificant || isCig ? '#000000' : '#1a1a1a',
    strokeWidth: isSignificant ? 3 : isCig ? 2 : 1.5,
    isSignificant,
    isCig,
    cigLevel: isCig ? probabilityKey : undefined,
  }] : []);
};

const collectOutlookFeatures = (
  day: DayType,
  outlookType: OutlookType,
  outlookMap: NonNullable<ForecastCycle['days'][DayType]>['data'][OutlookType],
  configuredOpacity: number | undefined,
): KmzExportFeature[] => {
  if (!outlookMap) return [];
  return [...outlookMap.entries()].flatMap(([probabilityKey, dayFeatures]) =>
    collectProbabilityFeatures(day, outlookType, probabilityKey, dayFeatures, configuredOpacity));
};

const collectDayFeatures = (
  day: DayType,
  forecastCycle: ForecastCycle,
  outlookTypes: OutlookType[],
): KmzExportFeature[] => {
  const outlookDay = forecastCycle.days[day];
  if (!outlookDay) return [];
  return outlookTypes.flatMap((outlookType) => collectOutlookFeatures(
    day,
    outlookType,
    outlookDay.data[outlookType],
    outlookDay.metadata.outlookOpacities?.[outlookType],
  ));
};

/** Collects exportable outlook polygons from the forecast cycle. */
export const collectKmzExportFeatures = ({ forecastCycle, options }: KmzExportInput): KmzExportFeature[] => {
  const outlookTypes = resolveOutlookTypes(options);
  return resolveDays(forecastCycle, options).flatMap((day) => collectDayFeatures(day, forecastCycle, outlookTypes));
};

export const getOutlookLabel = (outlookType: OutlookType): string => OUTLOOK_LABELS[outlookType];

export const groupFeaturesByDay = (features: KmzExportFeature[]): Map<DayType, KmzExportFeature[]> => {
  const grouped = new Map<DayType, KmzExportFeature[]>();
  features.forEach((feature) => {
    const bucket = grouped.get(feature.day) ?? [];
    bucket.push(feature);
    grouped.set(feature.day, bucket);
  });
  return grouped;
};

export const groupFeaturesByOutlook = (features: KmzExportFeature[]): Map<OutlookType, KmzExportFeature[]> => {
  const grouped = new Map<OutlookType, KmzExportFeature[]>();
  features.forEach((feature) => {
    const bucket = grouped.get(feature.outlookType) ?? [];
    bucket.push(feature);
    grouped.set(feature.outlookType, bucket);
  });
  return grouped;
};
