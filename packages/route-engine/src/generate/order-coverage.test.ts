import { describe, expect, it } from 'vitest';
import { allocateBandFill, bandMaximumStops, insertAdmin1Coverage, insertCountryCoverage, insertFeasibleCandidates, mandatoryLaunch } from './order-coverage';
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

  it('chooses a populated launch without using undefined pole longitude as a direction', () => {
    const west: Candidate = {
      id: 'west-populated',
      name: 'West populated',
      country: 'KI',
      lat: 1,
      lng: -140,
      timezone: 'Pacific/Kiritimati',
      utcOffsetMinutes: 840,
      category: 'populated',
      population: 100_000,
    };
    const east: Candidate = {
      id: 'east-sparse',
      name: 'East sparse',
      country: 'KI',
      lat: 1,
      lng: 170,
      timezone: 'Pacific/Kiritimati',
      utcOffsetMinutes: 840,
      category: 'populated',
      population: 5_000,
    };

    expect(mandatoryLaunch([west, east], [west, east], DEFAULT_GENERATOR_LIMITS)?.launch.id).toBe(west.id);
  });

  it('counts the already selected launch against its offset-band cap', () => {
    const place = ({ id, utcOffsetMinutes }: { id: string; utcOffsetMinutes: number }) => ({
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
      ...place({ id: 'launch', utcOffsetMinutes: 0 }),
      plannedArrivalUtc: '2026-12-25T01:00:00.000Z',
      plannedStopTier: 'town' as const,
      plannedStopDurationSeconds: 10,
    };

    const caps = bandMaximumStops([
      place({ id: 'same-band', utcOffsetMinutes: 0 }),
      place({ id: 'other-band', utcOffsetMinutes: 60 }),
    ], [launch], 11);

    expect(caps.get(0)).toBeGreaterThanOrEqual(1);
    expect([...caps.values()].reduce((sum, count) => sum + count, 0)).toBe(11);
  });

  it('keeps dense fill inside a band cap even for a required admin-1 unit', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, maxStopsPerCountry: 1 };
    const makePlace = ({ id, lat, lng, admin1Code }: { id: string; lat: number; lng: number; admin1Code?: string }): Candidate => ({
      id,
      name: id,
      country: 'US',
      lat,
      lng,
      timezone: 'America/Chicago',
      utcOffsetMinutes: -360,
      category: 'populated',
      population: 10_000,
      ...(admin1Code ? { admin1Code } : {}),
    });
    const launch = makePlace({ id: 'launch', lat: 29.7604, lng: -180 });
    const requiredState = makePlace({ id: 'required-state', lat: 30.2672, lng: 179.5, admin1Code: 'US-TX' });
    const initial = planTiming([launch], config);
    expect(initial).toBeDefined();
    if (!initial) throw new Error('Expected a feasible initial stop');

    const expanded = insertFeasibleCandidates(initial.places, [launch, requiredState], {
      config,
      bandSpreadMinutes: 0,
      coverageOnly: false,
      maxPositionAttempts: 40,
      maxStops: 700,
      maxStopsByBand: new Map([[-360, 1]]),
    });

    expect(expanded.map((place) => place.id)).not.toContain('required-state');
  });

  it('treats a missing band-cap entry as uncapped', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, maxStopsPerCountry: 10 };
    const launch: Candidate = {
      id: 'launch', name: 'Launch', country: 'KI', lat: 1, lng: 170,
      timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, category: 'populated', population: 10_000,
    };
    const unlistedBand: Candidate = {
      id: 'unlisted-band', name: 'Unlisted band', country: 'KI', lat: 1, lng: 168.5,
      timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, category: 'populated', population: 5_000,
    };
    const initial = planTiming([launch], config);
    expect(initial).toBeDefined();
    if (!initial) throw new Error('Expected a feasible launch');

    const expanded = insertFeasibleCandidates(initial.places, [launch, unlistedBand], {
      config,
      bandSpreadMinutes: 60,
      coverageOnly: false,
      maxPositionAttempts: 24,
      maxStops: 5,
      maxStopsByBand: new Map([[0, 1]]),
    });

    expect(expanded.map((place) => place.id)).toContain('unlisted-band');
  });

  it('replaces a redundant same-band stop when a required admin-1 unit is missing at the route ceiling', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, localLegSpeedKmh: 20_000 };
    const place = ({ id, lng, admin1Code = 'US-CA' }: { id: string; lng: number; admin1Code?: string }): Candidate => ({
      id,
      name: id,
      country: 'US',
      lat: 0,
      lng,
      timezone: 'Etc/GMT',
      utcOffsetMinutes: 0,
      admin1Code,
      category: 'populated',
      population: 10_000,
    });
    const route = Array.from({ length: 700 }, (_, index) => place({ id: `route-${index}`, lng: 179.5 - index * 0.5 }));
    const requiredState = place({ id: 'texas-candidate', lng: 0.25, admin1Code: 'US-TX' });
    const planned = planTiming(route, config);
    expect(planned).toBeDefined();
    if (!planned) throw new Error('Expected a feasible route at the stop ceiling');

    const covered = insertAdmin1Coverage(planned.places, [...route, requiredState], config);

    expect(covered).toHaveLength(route.length);
    expect(covered.some((stop) => stop.admin1Code === 'US-TX')).toBe(true);
  });

  it('preserves every existing country when replacing one stop with two near the route ceiling', () => {
    const makePlace = ({ id, country, lat, lng }: { id: string; country: string; lat: number; lng: number }): Candidate => ({
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
    const route = [...Array(699).keys()].map((index) => makePlace({
      id: `route-${index}`,
      country: index === 0 ? 'US' : index === 1 ? 'FR' : 'CA',
      lat: 0,
      lng: 100 - index * 0.2,
    }));
    const planned = planTiming(route, DEFAULT_GENERATOR_LIMITS);
    expect(planned).toBeDefined();
    if (!planned) throw new Error('Expected the 699-stop route to be feasible');

    const expanded = insertCountryCoverage(planned.places, [
      ...route,
      makePlace({ id: 'new-GB', country: 'GB', lat: 2, lng: -30 }),
      makePlace({ id: 'new-DE', country: 'DE', lat: 2, lng: -31 }),
    ], DEFAULT_GENERATOR_LIMITS);

    expect(expanded).toHaveLength(700);
    expect(new Set(expanded.map((place) => place.country))).toEqual(new Set(['US', 'FR', 'CA', 'GB', 'DE']));
  });

  it('chooses compatible country representatives before one that blocks multiple countries', () => {
    const makePlace = (place: Pick<Candidate, 'id' | 'country' | 'lat' | 'lng' | 'utcOffsetMinutes'>): Candidate => ({
      ...place,
      name: place.id,
      timezone: place.utcOffsetMinutes === -240 ? 'America/Anguilla' : 'Etc/UTC',
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
