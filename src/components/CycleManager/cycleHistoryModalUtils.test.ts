import { getDaySummary, hasDayData, deferCloseAfterConfirm } from './cycleHistoryModalUtils';
import type { SavedCycle } from '../../store/forecastSlice';

const baseCycle = (overrides: Partial<SavedCycle> = {}): SavedCycle => ({
  id: 'cycle-1',
  timestamp: '2026-04-20T10:00:00Z',
  cycleDate: '2026-04-20',
  label: 'Test',
  forecastCycle: { currentDay: 1, cycleDate: '2026-04-20', days: {} },
  stats: { forecastDays: 0, totalOutlooks: 0, totalFeatures: 0 },
  ...overrides,
});

describe('cycleHistoryModalUtils', () => {
  test('getDaySummary prefers cached stats when available', () => {
    expect(getDaySummary(baseCycle({ stats: { forecastDays: 2, totalOutlooks: 1, totalFeatures: 1 } }))).toBe(
      '2 forecast days',
    );
  });

  test('getDaySummary returns No data when legacy days are empty', () => {
    const cycle = baseCycle({
      forecastCycle: { currentDay: 1, cycleDate: '2026-04-20', days: {} },
    });
    delete cycle.stats;

    expect(getDaySummary(cycle)).toBe('No data');
  });

  test('hasDayData returns false for empty day data', () => {
    expect(hasDayData('1', {})).toBe(false);
  });

  test('GFC-WEB-G: deferCloseAfterConfirm runs onClose on the next microtask', async () => {
    const onClose = jest.fn();
    deferCloseAfterConfirm(onClose);
    expect(onClose).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
