import type { Feature } from 'geojson';
import type { ForecastCycle, OutlookDay } from '../types/outlooks';

export interface ForecastMetrics {
  forecastDays: number;
  totalOutlooks: number;
  totalFeatures: number;
}

/**
 * Counts severe-weather analytics only. Custom layers intentionally remain
 * outside these totals until a dedicated custom analytics contract exists.
 */
export const countForecastMetrics = (forecastCycle: ForecastCycle): ForecastMetrics => {
  let forecastDays = 0;
  let totalOutlooks = 0;
  let totalFeatures = 0;

  (Object.values(forecastCycle.days) as (OutlookDay | undefined)[]).forEach((dayData) => {
    let dayHasData = false;

    if (!dayData) {
      return;
    }

    if (dayData.metadata?.lowProbabilityOutlooks && dayData.metadata.lowProbabilityOutlooks.length > 0) {
      dayHasData = true;
    }

    (Object.values(dayData.data) as (Map<string, Feature[]> | undefined)[]).forEach((outlookMap) => {
      if (!(outlookMap instanceof Map) || outlookMap.size === 0) {
        return;
      }

      dayHasData = true;
      totalOutlooks += outlookMap.size;
      outlookMap.forEach((features) => {
        totalFeatures += features.length;
      });
    });

    if (dayHasData) {
      forecastDays += 1;
    }
  });

  return {
    forecastDays,
    totalOutlooks,
    totalFeatures,
  };
};
