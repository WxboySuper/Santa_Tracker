import { describe, expect, it } from 'vitest';
import { createLocationId, SCHEMA_VERSION, type Route } from '@santa-tracker/contracts';
import { buildReport } from './report';
import type { Candidate } from './types';
import { DEFAULT_GENERATOR_LIMITS } from './types';

const config = { ...DEFAULT_GENERATOR_LIMITS, weights: { hub: 1 }, total: 1 };
const place: Candidate = { id: 'one', name: 'One', country: 'Example', lat: 0, lng: 0, timezone: 'UTC', category: 'hub' };
const firstStop = { locationId: createLocationId('location_one'), arrivalIso: '2026-12-25T00:20:00.000Z', departureIso: '2026-12-25T00:21:00.000Z', durationSeconds: 60 };
const route: Route = {
  schemaVersion: SCHEMA_VERSION, season: 2026,
  stops: [firstStop],
};

describe('buildReport', () => {
  it('reports a route without inventing a leg', () => {
    const report = buildReport([place], route, config);
    expect(report.count).toBe(1);
    expect(report.legs.map((leg) => leg.kind)).toEqual(['launch', 'return']);
    expect(report.longestLegs).toHaveLength(2);
  });

  it('rejects incomplete routes or coordinate maps instead of reporting zero-distance legs', () => {
    expect(() => buildReport([], { ...route, stops: [] }, config)).toThrow(/empty route/);
    const twoStops: Route = { ...route, stops: [firstStop, { ...firstStop, locationId: createLocationId('location_two'), arrivalIso: '2026-12-25T00:22:00.000Z', departureIso: '2026-12-25T00:23:00.000Z' }] };
    expect(() => buildReport([place], twoStops, config)).toThrow(/do not match route stops/);
  });

  it('reports largest-remainder category targets that sum to the route total', () => {
    const reportConfig = { ...config, total: 2, weights: { hub: 1, cultural: 1, nature: 1 } };
    const report = buildReport([place], route, reportConfig);

    expect(Object.values(report.mix).map((entry) => entry.target)).toEqual([1, 1, 0]);
  });

  it('reports hourly arrivals, UTC offsets, and launch and return distance', () => {
    const report = buildReport([place], route, config);
    expect(report.hourly.at(-1)).toEqual({ hour: 14, count: 1 });
    expect(report.offsetBalance).toEqual({ 'UTC+00:00': 1 });
    expect(report.totalDistanceKm).toBeGreaterThan(0);
  });
});
