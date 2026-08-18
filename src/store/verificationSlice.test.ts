import type { RootState } from './index';
import {
  selectVerificationOutlooksForDay,
} from './verificationSlice';
import type { ForecastCycle } from '../types/outlooks';

describe('selectVerificationOutlooksForDay', () => {
  test('returns the same empty object when the forecast or day is missing', () => {
    const state = {
      verification: { loadedForecast: null },
    } as RootState;

    const withoutForecast = selectVerificationOutlooksForDay(state, 1);
    const withoutForecastAgain = selectVerificationOutlooksForDay(state, 2);

    state.verification.loadedForecast = {
      currentDay: 1,
      cycleDate: '2026-04-20',
      days: {},
    } as ForecastCycle;

    const withoutDay = selectVerificationOutlooksForDay(state, 1);

    expect(withoutForecast).toBe(withoutForecastAgain);
    expect(withoutDay).toBe(withoutForecast);
  });
});
