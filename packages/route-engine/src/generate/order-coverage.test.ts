import { describe, expect, it } from 'vitest';
import { allocateBandFill, bandMaximumStops, insertCountryCoverage, mandatoryLaunch } from './order-coverage';
import { planTiming } from './order-shared';
import { DEFAULT_GENERATOR_LIMITS, type Candidate } from './types';

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

  it('returns no mandatory launch for an empty candidate pool', () => {
    expect(mandatoryLaunch([], [], DEFAULT_GENERATOR_LIMITS)).toBeUndefined();
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

  it('preserves every existing country when replacing one stop with two near the route ceiling', () => {
    const makePlace = (id: string, country: string, lat: number, lng: number): Candidate => ({
      id,
      name: id,
      country,
      lat,
      lng,
      timezone: 'Etc/UTC',
      utcOffsetMinutes: 0,
      category: 'populated',
      population: 1_000,
    });
    const route = Array.from({ length: 699 }, (_, index) => makePlace(
      `route-${index}`,
      index === 0 ? 'US' : index === 1 ? 'FR' : 'CA',
      0,
      100 - index * 0.2,
    ));
    const planned = planTiming(route, DEFAULT_GENERATOR_LIMITS);
    expect(planned).toBeDefined();
    if (!planned) throw new Error('Expected the 699-stop route to be feasible');

    const expanded = insertCountryCoverage(planned.places, [
      ...route,
      makePlace('new-GB', 'GB', 2, -30),
      makePlace('new-DE', 'DE', 2, -31),
    ], DEFAULT_GENERATOR_LIMITS);

    expect(expanded).toHaveLength(700);
    expect(new Set(expanded.map((place) => place.country))).toEqual(new Set(['US', 'FR', 'CA', 'GB', 'DE']));
  });

  it('chooses compatible country representatives before one that blocks multiple countries', () => {
    const makePlace = (place: Pick<Candidate, 'id' | 'country' | 'lat' | 'lng' | 'utcOffsetMinutes'>): Candidate => ({
      ...place,
      name: place.id,
      timezone: 'Etc/UTC',
      category: 'populated',
      population: 1_000,
    });
    const launch = makePlace({ id: 'launch-US', country: 'US', lat: 0, lng: 100, utcOffsetMinutes: 0 });
    const initial = planTiming([launch], DEFAULT_GENERATOR_LIMITS);
    expect(initial).toBeDefined();
    if (!initial) throw new Error('Expected the initial route to be feasible');

    const expanded = insertCountryCoverage(initial.places, [
      launch,
      makePlace({ id: 'the-valley-AI', country: 'AI', lat: 18.220833333333, lng: -63.051666666667, utcOffsetMinutes: -240 }),
      makePlace({ id: 'philipsburg-SX', country: 'SX', lat: 18.024166666667, lng: -63.043333333333, utcOffsetMinutes: -240 }),
      makePlace({ id: 'marigot-MF', country: 'MF', lat: 18.066666666667, lng: -63.084722222222, utcOffsetMinutes: -240 }),
    ], DEFAULT_GENERATOR_LIMITS);

    const countries = new Set(expanded.map((place) => place.country));
    expect(countries.has('AI')).toBe(true);
    expect(countries.has('SX')).toBe(true);
    expect(countries.has('MF')).toBe(false);
  });
});
