import type { SavedCycle } from '../../store/forecastSlice';
import { DayType } from '../../types/outlooks';

/** Returns true when a saved day contains at least one populated outlook map. */
export const hasDayData = (
  dayKey: string,
  days: SavedCycle['forecastCycle']['days'],
): boolean => {
  const day = days[Number(dayKey) as DayType];
  if (!day?.data) {
    return false;
  }

  return Object.values(day.data).some((map) => Boolean(map && map.size > 0));
};

/** Formats cached forecast-day stats when present on a saved cycle. */
const formatStatsSummary = (forecastDays: number | undefined): string | null => {
  if (typeof forecastDays !== 'number') {
    return null;
  }
  if (forecastDays <= 0) {
    return 'No polygons';
  }

  const label = forecastDays === 1 ? 'forecast day' : 'forecast days';
  return `${forecastDays} ${label}`;
};

/** Builds a legacy day-key summary when cached stats are unavailable. */
const formatLegacyDaySummary = (days: SavedCycle['forecastCycle']['days']): string => {
  if (!days) {
    return 'No data';
  }

  const keys = Object.keys(days);
  if (keys.length === 0) {
    return 'No data';
  }

  const daysWithData = keys.filter((dayKey) => hasDayData(dayKey, days));
  return daysWithData.length > 0 ? `Days: ${daysWithData.join(', ')}` : 'No polygons';
};

/** Formats the summary for a saved cycle using cached stats or a day-by-day fallback. */
export const getDaySummary = (cycle: SavedCycle): string => {
  const statsSummary = formatStatsSummary(cycle.stats?.forecastDays);
  if (statsSummary) {
    return statsSummary;
  }

  return formatLegacyDaySummary(cycle.forecastCycle?.days);
};

/** Defers closing the parent modal until nested confirm UI has unmounted. */
export const deferCloseAfterConfirm = (onClose: () => void): void => {
  queueMicrotask(onClose);
};
