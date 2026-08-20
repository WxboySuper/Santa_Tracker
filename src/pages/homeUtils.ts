import type { ForecastCycle, OutlookDay, DayType } from '../types/outlooks';
import type { LifetimeCycleStats, SavedCycle } from '../store/forecastSlice';
import type { Feature } from 'geojson';
import { countForecastMetrics } from '../utils/forecastMetrics';

/** Converts a YYYY-MM-DD cycle date into a stable UTC day index for day-to-day comparisons. */
const getUtcDayIndex = (cycleDate: string): number => {
  const [year, month, day] = cycleDate.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
};

/** Calculates a local streak of consecutive saved cycle dates, ending on the newest saved date. */
const computeSavedCycleStreak = (savedCycles: SavedCycle[]): number => {
  if (savedCycles.length === 0) {
    return 0;
  }

  const uniqueDates = Array.from(new Set(savedCycles.map((cycle) => cycle.cycleDate))).sort(
    (left, right) => new Date(right).getTime() - new Date(left).getTime()
  );

  let streak = 1;

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const previousDayIndex = getUtcDayIndex(uniqueDates[index - 1]);
    const currentDayIndex = getUtcDayIndex(uniqueDates[index]);
    const diffInDays = previousDayIndex - currentDayIndex;

    if (diffInDays !== 1) {
      break;
    }

    streak += 1;
  }

  return streak;
};

const getTotalForecastsMade = (
  currentForecastDays: number,
  savedCycles: SavedCycle[],
  lifetimeStats?: LifetimeCycleStats,
): number => lifetimeStats
  ? lifetimeStats.totalForecastsMade + currentForecastDays
  : savedCycles.reduce((runningTotal, cycle) => runningTotal + cycle.stats.forecastDays, currentForecastDays);

const summarizeOutlookDay = (day: DayType, dayData: OutlookDay | undefined) => {
  if (!dayData) return null;
  const outlookMaps = (Object.values(dayData.data) as (Map<string, Feature[]> | undefined)[])
    .filter((outlookMap): outlookMap is Map<string, Feature[]> => outlookMap instanceof Map && outlookMap.size > 0);
  const hasLowProbabilityData = (dayData.metadata?.lowProbabilityOutlooks?.length ?? 0) > 0;
  return {
    day,
    hasData: hasLowProbabilityData || outlookMaps.length > 0,
    totalOutlooks: outlookMaps.length,
    totalFeatures: outlookMaps.reduce((total, outlookMap) => (
      total + Array.from(outlookMap.values()).reduce((dayTotal, features) => dayTotal + features.length, 0)
    ), 0),
  };
};

const summarizeCurrentCycle = (forecastCycle: ForecastCycle) => Object.entries(forecastCycle.days)
  .map(([day, dayData]) => summarizeOutlookDay(parseInt(day) as DayType, dayData))
  .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
  .reduce((totals, summary) => ({
    daysWithData: summary.hasData ? [...totals.daysWithData, summary.day] : totals.daysWithData,
    totalOutlooks: totals.totalOutlooks + summary.totalOutlooks,
    totalFeatures: totals.totalFeatures + summary.totalFeatures,
  }), { daysWithData: [] as DayType[], totalOutlooks: 0, totalFeatures: 0 });

/** Aggregates outlook statistics from a forecast cycle for dashboard display. */
export function computeHomeStats(
  forecastCycle: ForecastCycle,
  savedCycles: SavedCycle[],
  lifetimeStats?: LifetimeCycleStats,
) {
  const currentCycleMetrics = countForecastMetrics(forecastCycle);
  const currentCycleStats = summarizeCurrentCycle(forecastCycle);

  return {
    daysWithData: currentCycleStats.daysWithData,
    totalOutlooks: currentCycleStats.totalOutlooks,
    totalFeatures: currentCycleStats.totalFeatures,
    savedCyclesCount: savedCycles.length,
    totalForecastsMade: getTotalForecastsMade(currentCycleMetrics.forecastDays, savedCycles, lifetimeStats),
    totalCyclesMade: lifetimeStats?.totalCyclesMade ?? savedCycles.length,
    forecastStreak: lifetimeStats?.forecastStreak ?? computeSavedCycleStreak(savedCycles),
  };
}

/** Formats an ISO date string (YYYY-MM-DD) into a human-readable weekday and date string. */
export function formatCycleDate(cycleDate: string) {
  const [year, month, day] = cycleDate.split('-').map(Number);
  const localDate = new Date(year, month - 1, day);
  return localDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
