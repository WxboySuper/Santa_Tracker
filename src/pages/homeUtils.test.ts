import { computeHomeStats, formatCycleDate } from './homeUtils';
import type { ForecastCycle, OutlookData } from '../types/outlooks';
import type { SavedCycle } from '../store/forecastSlice';

const emptyOutlookData = (): OutlookData => ({
  categorical: new Map(),
  tornado: new Map(),
  wind: new Map(),
  hail: new Map(),
});

const makeCycle = (): ForecastCycle => ({
  id: 'current',
  cycleDate: '2026-04-24',
  currentDay: 1,
  days: {
    1: {
      data: {
        ...emptyOutlookData(),
        tornado: new Map([['5%', [{ type: 'Feature', geometry: null, properties: {} } as never]]]),
      },
      discussion: '',
      metadata: { lowProbabilityOutlooks: ['tornado'] },
    },
    2: {
      data: emptyOutlookData(),
      discussion: '',
      metadata: {},
    },
  },
});

const makeSavedCycle = (cycleDate: string, forecastDays: number): SavedCycle => ({
  id: cycleDate,
  cycleDate,
  timestamp: `${cycleDate}T12:00:00.000Z`,
  label: '',
  version: '1',
  stats: {
    forecastDays,
    totalFeatures: 0,
    outlookTypes: [],
  },
  data: {} as never,
});

describe('homeUtils', () => {
  test('computes dashboard stats from current and saved cycles', () => {
    const stats = computeHomeStats(makeCycle(), [
      makeSavedCycle('2026-04-24', 2),
      makeSavedCycle('2026-04-23', 3),
      makeSavedCycle('2026-04-23', 7),
      makeSavedCycle('2026-04-22', 4),
      makeSavedCycle('2026-04-20', 5),
    ]);

    expect(stats.daysWithData).toEqual([1]);
    expect(stats.totalOutlooks).toBe(1);
    expect(stats.totalFeatures).toBe(1);
    expect(stats.savedCyclesCount).toBe(5);
    expect(stats.totalForecastsMade).toBeGreaterThan(14);
    expect(stats.totalCyclesMade).toBe(5);
    expect(stats.forecastStreak).toBe(3);
  });

  test('handles empty saved history and formats cycle dates locally', () => {
    expect(computeHomeStats(makeCycle(), []).forecastStreak).toBe(0);
    expect(formatCycleDate('2026-04-24')).toContain('April 24, 2026');
  });

  test('adds current-cycle days to persisted lifetime forecast totals', () => {
    const stats = computeHomeStats(makeCycle(), [], {
      totalCyclesMade: 60,
      totalForecastsMade: 100,
      forecastStreak: 75,
      lastSavedCycleDate: '2026-04-24',
    });

    expect(stats.totalCyclesMade).toBe(60);
    expect(stats.totalForecastsMade).toBe(101);
    expect(stats.forecastStreak).toBe(75);
  });
});
