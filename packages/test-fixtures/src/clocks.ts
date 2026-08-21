/**
 * Deterministic clocks for seasonal behavior tests.
 * Production code must accept `now: Date` or `clock: () => Date`.
 */

export function fixedClock(iso: string): () => Date {
  const fixed = new Date(iso);
  return () => new Date(fixed.getTime());
}

export function sequenceClock(isoValues: string[]): () => Date {
  let i = 0;
  return () => {
    const value = isoValues[Math.min(i, isoValues.length - 1)]!;
    i++;
    return new Date(value);
  };
}

export const CHRISTMAS_EVE_2026 = '2026-12-24T00:00:00.000Z';
export const CHRISTMAS_MORNING_2026 = '2026-12-25T06:00:00.000Z';
export const ADVENT_START_2026 = '2026-12-01T00:00:00.000Z';
