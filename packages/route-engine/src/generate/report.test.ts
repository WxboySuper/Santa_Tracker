import { describe, expect, it } from 'vitest';
import { createLocationId, SCHEMA_VERSION, type Route } from '@santa-tracker/contracts';
import { buildReport } from './report';
import type { Candidate } from './types';
import { DEFAULT_GENERATOR_LIMITS } from './types';

const place: Candidate = { id: 'one', name: 'One', country: 'GB', lat: 0, lng: 0, timezone: 'UTC', category: 'hub', population: 100_000 };
const firstStop = { locationId: createLocationId('location_one'), arrivalIso: '2026-12-25T01:00:00.000Z', departureIso: '2026-12-25T01:00:30.000Z', durationSeconds: 30 };
const route: Route = { schemaVersion: SCHEMA_VERSION, season: 2026, stops: [firstStop] };

describe('buildReport', () => {
  it('reports countries, tiers, histogram, population coverage and launch and return legs', () => {
    const pool = [place, { ...place, id: 'two', name: 'Two', country: 'US', lat: 0, lng: 1 }];
    const report = buildReport([place], route, DEFAULT_GENERATOR_LIMITS, pool);
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
    expect(report.longestLegs).toHaveLength(2);
    expect(report.populationCoverageWithin500Km).toBe(1);
  });

  it('rejects incomplete routes instead of reporting missing locations as zero-distance legs', () => {
    expect(() => buildReport([], { ...route, stops: [] })).toThrow(/empty route/);
    const twoStops: Route = { ...route, stops: [firstStop, { ...firstStop, locationId: createLocationId('location_two'), arrivalIso: '2026-12-25T01:01:00.000Z', departureIso: '2026-12-25T01:01:30.000Z' }] };
    expect(() => buildReport([place], twoStops)).toThrow(/do not match route stops/);
  });
});
