import type { DayType, ForecastCycle, OutlookData, OutlookDay } from '../../types/outlooks';
import type { ParsedKmlPlacemark } from './types';

const createBaseOutlookData = (day: DayType): OutlookData => {
  if (day === 1 || day === 2) {
    return { tornado: new Map(), wind: new Map(), hail: new Map(), categorical: new Map() };
  }
  if (day === 3) {
    return { totalSevere: new Map(), categorical: new Map() };
  }
  return { 'day4-8': new Map() };
};

const createOutlookDay = (day: DayType): OutlookDay => {
  const now = new Date().toISOString();
  return {
    day,
    data: createBaseOutlookData(day),
    metadata: {
      issueDate: now,
      validDate: now,
      issuanceTime: '1200',
      createdAt: now,
      lastModified: now,
      lowProbabilityOutlooks: [],
    },
  };
};

/** Merges parsed KML placemarks into a forecast cycle, preserving untouched days. */
export const forecastCycleFromKmlPlacemarks = (
  placemarks: ParsedKmlPlacemark[],
  baseCycle?: ForecastCycle,
): ForecastCycle => {
  const cycle: ForecastCycle = baseCycle
    ? {
        ...baseCycle,
        days: Object.fromEntries(
          Object.entries(baseCycle.days).map(([day, outlookDay]) => [
            day,
            outlookDay
              ? { ...outlookDay, data: { ...outlookDay.data } }
              : outlookDay,
          ])
        ) as ForecastCycle['days'],
      }
    : {
        cycleDate: new Date().toISOString().slice(0, 10),
        currentDay: placemarks[0]?.day ?? 1,
        days: {},
      };

  placemarks.forEach((placemark) => {
    const existingDay = cycle.days[placemark.day] ?? createOutlookDay(placemark.day);
    const outlookMap = new Map(existingDay.data[placemark.outlookType] ?? []);
    const bucket = [...(outlookMap.get(placemark.probabilityKey) ?? []), placemark.feature];
    outlookMap.set(placemark.probabilityKey, bucket);
    cycle.days[placemark.day] = {
      ...existingDay,
      data: { ...existingDay.data, [placemark.outlookType]: outlookMap },
      metadata: { ...existingDay.metadata, lastModified: new Date().toISOString() },
    };
  });

  if (!cycle.days[cycle.currentDay]) {
    cycle.currentDay = placemarks[0]?.day ?? 1;
  }
  return cycle;
};
