import { describe, expect, it } from 'vitest';
import { createLocationId, SCHEMA_VERSION, type Route } from '@santa-tracker/contracts';
import { legSpeedKmh } from '../geo';
import { buildReport } from './report';
import type { Candidate } from './types';
import { DEFAULT_GENERATOR_LIMITS, NORTH_POLE, TAKEOFF_UTC } from './types';

const place: Candidate = { id: 'one', name: 'One', country: 'GB', lat: 0, lng: 0, timezone: 'UTC', utcOffsetMinutes: 0, category: 'hub', population: 100_000 };
const firstStop = { locationId: createLocationId('location_one'), arrivalIso: '2026-12-25T01:00:00.000Z', departureIso: '2026-12-25T01:00:30.000Z', durationSeconds: 30 };
const route: Route = { schemaVersion: SCHEMA_VERSION, season: 2026, stops: [firstStop] };
const cleanValidation = { invalidCandidateIds: [], duplicateCandidateIds: [] };

describe('buildReport', () => {
  it('reports countries, tiers, histogram, population coverage and launch and return legs', () => {
    const pool = [place, { ...place, id: 'two', name: 'Two', country: 'US', lat: 0, lng: 1 }];
    const report = buildReport([place], route, { config: DEFAULT_GENERATOR_LIMITS, pool, ...cleanValidation });
    expect(report.count).toBe(1);
    expect(report.candidateCount).toBe(2);
    expect(report.unselectedCandidateCount).toBe(1);
    expect(report.countriesCovered).toBe(1);
    expect(report.countryCodes).toEqual(['GB']);
    expect(report.uncoveredCountryCodes).toEqual(['US']);
    expect(report.stopTiers.city).toBe(1);
    expect(report.localArrivalHistogram).toEqual({ '01:00': 1 });
    expect(report.localArrivalMin).toBe('01:00');
    expect(report.localArrivalMax).toBe('01:00');
    expect(report.shortDeliveryLegCount).toBe(0);
    expect(report.deliveryLegCount).toBe(0);
    expect(report.shareDeliveryLegsUnder300Km).toBe(0);
    expect(report.subnationalCoverageNote).toContain('no US state');
    expect(report.legs.map((leg) => leg.kind)).toEqual(['launch', 'return']);
    expect(report.legs[0]?.kmh).toBe(legSpeedKmh(
      NORTH_POLE,
      place,
      (Date.parse(firstStop.arrivalIso) - Date.parse(TAKEOFF_UTC)) / 1000,
    ));
    expect(report.longestLegs).toHaveLength(2);
    expect(report.populationCoverageWithin500Km).toBe(1);
  });

  it('rejects incomplete routes instead of reporting missing locations as zero-distance legs', () => {
    expect(() => buildReport([], { ...route, stops: [] }, { config: DEFAULT_GENERATOR_LIMITS, pool: [place], ...cleanValidation })).toThrow(/empty route/);
    const twoStops: Route = { ...route, stops: [firstStop, { ...firstStop, locationId: createLocationId('location_two'), arrivalIso: '2026-12-25T01:01:00.000Z', departureIso: '2026-12-25T01:01:30.000Z' }] };
    expect(() => buildReport([place], twoStops, { config: DEFAULT_GENERATOR_LIMITS, pool: [place], ...cleanValidation })).toThrow(/do not match route stops/);
    const nullStop: Route = { ...route, stops: [null] as unknown as Route['stops'] };
    expect(() => buildReport([place], nullStop, { config: DEFAULT_GENERATOR_LIMITS, pool: [place], ...cleanValidation })).toThrow(/Missing first route stop/);
  });

  it('rejects a missing snapshot offset instead of reporting arrivals in UTC', () => {
    const { utcOffsetMinutes: _offset, ...missingOffset } = place;
    expect(() => buildReport([missingOffset], route, {
      config: DEFAULT_GENERATOR_LIMITS,
      pool: [missingOffset],
      ...cleanValidation,
    })).toThrow(/Missing snapshot UTC offset/);
  });

  it('measures delivery speed over the scheduled departure-to-arrival interval', () => {
    const next: Candidate = { ...place, id: 'two', name: 'Two', country: 'US', lat: 0.5, lng: 1 };
    const secondStop = {
      ...firstStop,
      locationId: createLocationId('location_two'),
      arrivalIso: '2026-12-25T02:00:00.000Z',
      departureIso: '2026-12-25T02:00:30.000Z',
    };
    const twoStopRoute: Route = { ...route, stops: [firstStop, secondStop] };
    const report = buildReport([place, next], twoStopRoute, { config: DEFAULT_GENERATOR_LIMITS, pool: [place, next], ...cleanValidation });
    const delivery = report.legs.find((leg) => leg.kind === 'delivery');
    expect(delivery?.kmh).toBe(legSpeedKmh(
      place,
      next,
      (Date.parse(secondStop.arrivalIso) - Date.parse(firstStop.departureIso)) / 1000,
    ));
  });

  it('orders local arrival bounds across midnight as a continuous sweep', () => {
    const next: Candidate = { ...place, id: 'two', name: 'Two', timezone: 'Etc/UTC', utcOffsetMinutes: 0 };
    const first = { ...firstStop, arrivalIso: '2026-12-24T23:00:00.000Z', departureIso: '2026-12-24T23:00:30.000Z' };
    const second = { ...firstStop, locationId: createLocationId('location_two'), arrivalIso: '2026-12-25T04:00:00.000Z', departureIso: '2026-12-25T04:00:30.000Z' };
    const report = buildReport([place, next], { ...route, stops: [first, second] }, {
      config: DEFAULT_GENERATOR_LIMITS,
      pool: [place, next],
      ...cleanValidation,
    });

    expect(report.localArrivalMin).toBe('23:00');
    expect(report.localArrivalMax).toBe('04:00');
  });

  it('requires complete candidate and validation context and reports skipped rows and timing limits', () => {
    const lateStop = { ...firstStop, arrivalIso: '2026-12-25T14:00:00.000Z', departureIso: '2026-12-25T14:01:00.000Z' };
    const lateRoute: Route = { ...route, stops: [lateStop] };
    const report = buildReport([place], lateRoute, {
      config: DEFAULT_GENERATOR_LIMITS,
      pool: [place, { ...place, id: 'second', country: 'US' }],
      invalidCandidateIds: ['bad-row'],
      duplicateCandidateIds: ['duplicate-id'],
    });

    expect(report.invalidCandidateIds).toEqual(['bad-row']);
    expect(report.issues).toContain('Invalid candidate row skipped: bad-row');
    expect(report.issues).toContain('Duplicate candidate ID skipped: duplicate-id');
    expect(report.issues).toContain('Last delivery departs after the 27-hour delivery window.');
    expect(report.issues).toContain('North Pole return exceeds the 28-hour flight window.');
    expect(report.uncoveredCountryCodes).toEqual(['US']);
  });
});
