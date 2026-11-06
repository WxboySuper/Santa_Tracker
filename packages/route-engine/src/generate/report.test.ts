import { describe, expect, it } from 'vitest';
import { createLocationId, SCHEMA_VERSION, type Route } from '@santa-tracker/contracts';
import { buildReport } from './report';
import type { Candidate } from './types';
import { DEFAULT_GENERATOR_LIMITS } from './types';

const config = { ...DEFAULT_GENERATOR_LIMITS, weights: { hub: 1 }, total: 1 };
const place: Candidate = { id: 'one', name: 'One', country: 'Example', lat: 0, lng: 0, timezone: 'UTC', category: 'hub' };
const route: Route = {
  schemaVersion: SCHEMA_VERSION, season: 2026,
  stops: [{ locationId: createLocationId('location_one'), arrivalIso: '2026-12-25T00:20:00.000Z', departureIso: '2026-12-25T00:21:00.000Z', durationSeconds: 60 }],
};

describe('buildReport', () => {
  it('reports a route without inventing a leg', () => {
    const report = buildReport([place], route, config, new Map([[createLocationId('location_one'), place]]));
    expect(report.count).toBe(1);
    expect(report.fastestLeg).toBeNull();
    expect(report.longestLegs).toEqual([]);
  });

  it('rejects incomplete routes or coordinate maps instead of reporting zero-distance legs', () => {
    expect(() => buildReport([], { ...route, stops: [] }, config, new Map())).toThrow(/empty route/);
    const twoStops: Route = { ...route, stops: [...route.stops, { ...route.stops[0]!, locationId: createLocationId('location_two'), arrivalIso: '2026-12-25T00:22:00.000Z', departureIso: '2026-12-25T00:23:00.000Z' }] };
    expect(() => buildReport([place, place], twoStops, config, new Map([[createLocationId('location_one'), place]]))).toThrow(/Missing coordinates/);
  });
});
