import type {
  GFCForecastSaveData,
  ForecastCycle,
  DayType,
  OutlookDay,
  OutlookData,
  DiscussionData,
  SerializedOutlookData,
  OutlookType,
} from '../types/outlooks';
import { coerceOutlookProbabilityMap } from './outlookMapCoercion';
import { isCustomLayerCollection } from '../lib/customProducts';

type SerializedDay = {
  day: DayType;
  metadata: {
    issueDate: string;
    validDate: string;
    issuanceTime: string;
    lowProbabilityOutlooks?: OutlookType[];
    createdAt?: string;
    lastModified?: string;
  };
  data: SerializedOutlookData;
  customLayers?: OutlookDay['customLayers'];
  discussion?: DiscussionData;
};

/** Converts serialized outlook map data back into a Map instance. */
const deserializeOutlookMap = <K extends string, V>(
  value: [K, V][] | Record<string, V> | Map<K, V> | undefined,
): Map<K, V> | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const coerced = coerceOutlookProbabilityMap(value);
  return (coerced as Map<K, V> | null) ?? new Map<K, V>();
};

/** Rehydrates one saved outlook day from serialized forecast JSON. */
const deserializeSavedOutlookDay = (savedDay: SerializedDay): OutlookDay => {
  const outlookData: OutlookData = {};

  if (savedDay.data.tornado) outlookData.tornado = deserializeOutlookMap(savedDay.data.tornado);
  if (savedDay.data.wind) outlookData.wind = deserializeOutlookMap(savedDay.data.wind);
  if (savedDay.data.hail) outlookData.hail = deserializeOutlookMap(savedDay.data.hail);
  if (savedDay.data.totalSevere) outlookData.totalSevere = deserializeOutlookMap(savedDay.data.totalSevere);
  if (savedDay.data['day4-8']) outlookData['day4-8'] = deserializeOutlookMap(savedDay.data['day4-8']);
  if (savedDay.data.categorical) outlookData.categorical = deserializeOutlookMap(savedDay.data.categorical);

  const meta = savedDay.metadata as Partial<{
    issueDate?: string;
    validDate?: string;
    issuanceTime?: string;
    lowProbabilityOutlooks?: OutlookDay['metadata']['lowProbabilityOutlooks'];
    createdAt?: string;
    lastModified?: string;
  }>;

  return {
    day: savedDay.day,
    metadata: {
      issueDate: meta.issueDate ?? savedDay.metadata.issueDate,
      validDate: meta.validDate ?? savedDay.metadata.validDate,
      issuanceTime: meta.issuanceTime ?? savedDay.metadata.issuanceTime,
      lowProbabilityOutlooks: meta.lowProbabilityOutlooks ?? savedDay.metadata.lowProbabilityOutlooks ?? [],
      createdAt: meta.createdAt ?? new Date().toISOString(),
      lastModified: meta.lastModified ?? new Date().toISOString(),
    },
    data: outlookData,
    ...(isCustomLayerCollection(savedDay.customLayers)
      ? { customLayers: JSON.parse(JSON.stringify(savedDay.customLayers)) as OutlookDay['customLayers'] }
      : {}),
    discussion: (savedDay as Partial<{ discussion?: DiscussionData }>).discussion,
  };
};

/** Rehydrates all saved outlook days from serialized forecast JSON. */
export const deserializeForecastCycleDays = (
  cycle: NonNullable<GFCForecastSaveData['forecastCycle']>,
): ForecastCycle['days'] => {
  const days: Partial<Record<DayType, OutlookDay>> = {};

  (Object.keys(cycle.days) as unknown as DayType[]).forEach((day) => {
    const savedDay = cycle.days[day];
    if (savedDay) {
      days[day] = deserializeSavedOutlookDay(savedDay);
    }
  });

  return days;
};
