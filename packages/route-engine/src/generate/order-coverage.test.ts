import { describe, expect, it } from 'vitest';
import { allocateBandFill, bandMaximumStops } from './order-coverage';

describe('band fill allocation', () => {
  it('allocates the full remainder when every band weight is zero', () => {
    const allocation = allocateBandFill([
      { offset: -480, weight: 0 },
      { offset: -420, weight: 0 },
      { offset: -360, weight: 0 },
    ], 17);

    expect(allocation.reduce((total, item) => total + item.count, 0)).toBe(17);
    expect(Object.fromEntries(allocation.map(({ offset, count }) => [offset, count]))).toEqual({
      '-480': 5,
      '-420': 6,
      '-360': 6,
    });
  });

  it('counts the already selected launch against its offset-band cap', () => {
    const place = (id: string, utcOffsetMinutes: number) => ({
      id,
      name: id,
      country: 'US',
      lat: 37,
      lng: -95,
      timezone: 'Etc/UTC',
      utcOffsetMinutes,
      category: 'populated' as const,
      population: 10_000,
    });
    const launch = {
      ...place('launch', 0),
      plannedArrivalUtc: '2026-12-25T01:00:00.000Z',
      plannedStopTier: 'town' as const,
      plannedStopDurationSeconds: 10,
    };

    const caps = bandMaximumStops([place('same-band', 0), place('other-band', 60)], [launch], 11);

    expect(caps.get(0)).toBeGreaterThanOrEqual(1);
    expect([...caps.values()].reduce((sum, count) => sum + count, 0)).toBe(11);
  });
});
