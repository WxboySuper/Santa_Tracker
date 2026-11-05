import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Route } from '@santa-tracker/contracts';
import { validateRouteGeometry } from './geometry-validate';
import type { LatLng } from './geo';

const base = Date.parse('2026-12-24T00:00:00.000Z');
const iso = (offsetSeconds: number): string => new Date(base + offsetSeconds * 1000).toISOString();

function route(stops: { id: string; arrive: number; depart: number }[]): Route {
  return {
    schemaVersion: SCHEMA_VERSION,
    season: 2026,
    stops: stops.map((s) => ({
      locationId: s.id,
      arrivalIso: iso(s.arrive),
      departureIso: iso(s.depart),
      durationSeconds: s.depart - s.arrive,
    })),
  } as Route;
}

const coords = new Map<string, LatLng>([
  ['west', { lat: 0, lng: 179 }],
  ['east', { lat: 0, lng: -179 }],
  ['london', { lat: 51.5, lng: -0.1 }],
  ['sydney', { lat: -33.9, lng: 151.2 }],
]);

describe('validateRouteGeometry', () => {
  it('accepts a plausible dateline-crossing leg and measures it the short way', () => {
    // ~222 km in 10 minutes = ~1,300 km/h.
    const result = validateRouteGeometry(
      route([
        { id: 'west', arrive: 0, depart: 60 },
        { id: 'east', arrive: 660, depart: 720 },
      ]),
      coords,
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.totalDistanceKm).toBeGreaterThan(220);
    expect(result.totalDistanceKm).toBeLessThan(225);
  });

  it('errors on impossible speeds', () => {
    // London -> Sydney (~17,000 km) in 60 seconds.
    const result = validateRouteGeometry(
      route([
        { id: 'london', arrive: 0, depart: 60 },
        { id: 'sydney', arrive: 120, depart: 180 },
      ]),
      coords,
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ severity: 'error', path: 'stops.1.arrivalIso' });
  });

  it('errors when distinct places have no travel time', () => {
    const result = validateRouteGeometry(
      route([
        { id: 'london', arrive: 0, depart: 60 },
        { id: 'sydney', arrive: 60, depart: 120 },
      ]),
      coords,
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toMatch(/no travel time/);
  });

  it('warns about stalled legs and long quiet gaps without failing', () => {
    // London -> Sydney over 5 hours is ~3,400 km/h: fine speed, but a long gap.
    const gap = validateRouteGeometry(
      route([
        { id: 'london', arrive: 0, depart: 60 },
        { id: 'sydney', arrive: 5 * 3600, depart: 5 * 3600 + 60 },
      ]),
      coords,
    );
    expect(gap.ok).toBe(true);
    expect(gap.issues.some((i) => i.severity === 'warning' && i.message.includes('quiet stretch'))).toBe(true);

    // 222 km over 2 hours is ~110 km/h: Santa looks stalled.
    const stalled = validateRouteGeometry(
      route([
        { id: 'west', arrive: 0, depart: 60 },
        { id: 'east', arrive: 7200, depart: 7260 },
      ]),
      coords,
    );
    expect(stalled.ok).toBe(true);
    expect(stalled.issues.some((i) => i.message.includes('stalled'))).toBe(true);
  });

  it('errors on missing or out-of-range coordinates and does not throw', () => {
    const bad = new Map<string, LatLng>([['london', { lat: 51.5, lng: -0.1 }], ['oops', { lat: 123, lng: 0 }]]);
    const result = validateRouteGeometry(
      route([
        { id: 'london', arrive: 0, depart: 60 },
        { id: 'oops', arrive: 600, depart: 660 },
        { id: 'ghost', arrive: 1200, depart: 1260 },
      ]),
      bad,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(2);
    expect(result.totalDistanceKm).toBe(0);
  });

  it('honours custom limits', () => {
    const r = route([
      { id: 'west', arrive: 0, depart: 60 },
      { id: 'east', arrive: 660, depart: 720 },
    ]);
    expect(validateRouteGeometry(r, coords, { maxSpeedKmh: 500 }).ok).toBe(false);
  });
});
