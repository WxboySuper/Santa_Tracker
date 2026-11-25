import { describe, expect, it } from 'vitest';
import { generateRoute, type Candidate, DEFAULT_GENERATOR_LIMITS } from './generator';
import { isInChristmasWindow, localClock } from './sweep';

const candidates: Candidate[] = [
  { id: 'pacific-a', name: 'Pacific A', country: 'FJ', lat: 80, lng: 170, timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 1_200_000, category: 'hub' },
  { id: 'pacific-b', name: 'Pacific B', country: 'WS', lat: 80, lng: 150, timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 200_000, category: 'hub' },
  { id: 'pacific-c', name: 'Pacific C', country: 'TO', lat: 80, lng: 130, timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 20_000, category: 'hub' },
  { id: 'pacific-d', name: 'Pacific D', country: 'NZ', lat: 80, lng: 110, timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 100, category: 'hub' },
];

const config = { ...DEFAULT_GENERATOR_LIMITS, maxStopsPerCountry: 6, minStopSeparationKm: 20 };

describe('generateRoute midnight sweep', () => {
  it('creates reproducible route output with westward ordering', () => {
    const first = generateRoute(candidates, config);
    const second = generateRoute(candidates, config);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(new Set(first.locations.map((place) => place.id))).toEqual(new Set(candidates.map((place) => place.id)));
    for (let index = 1; index < first.locations.length; index++) {
      const from = first.locations[index - 1];
      const to = first.locations[index];
      if (!from || !to) throw new Error('Expected adjacent route stops');
      expect(((to.lng - from.lng + 540) % 360) - 180).toBeLessThanOrEqual(1);
    }
  });

  it('keeps every arrival inside 23:00 to 05:00 local and stores its tier dwell', () => {
    const generated = generateRoute(candidates, config);
    for (const [index, place] of generated.locations.entries()) {
      const stop = generated.route.stops[index];
      if (!stop) throw new Error('Expected a route stop');
      expect(isInChristmasWindow({ iso: stop.arrivalIso, timezoneOrOffset: place.utcOffsetMinutes ?? 0 })).toBe(true);
      expect(stop.departureIso).toBe(new Date(Date.parse(stop.arrivalIso) + (place.plannedStopDurationSeconds ?? 0) * 1000).toISOString());
      const node = generated.document.route_nodes[index + 1] as { stop_experience: { stop_tier: string; duration_seconds: number } };
      expect(node.stop_experience.stop_tier).toBe(place.plannedStopTier);
      expect(node.stop_experience.duration_seconds).toBe(place.plannedStopDurationSeconds);
    }
    const firstLocal = localClock({ iso: generated.route.stops[0]!.arrivalIso, timezoneOrOffset: 840 });
    expect(firstLocal.hour).toBeGreaterThanOrEqual(0);
    expect(firstLocal.hour).toBeLessThanOrEqual(5);
  });

  it('keeps the p90 below 20,000 km/h and every leg under 25,000 km/h', () => {
    const generated = generateRoute(candidates, config);
    expect(generated.report.p90LegSpeedKmh).toBeLessThanOrEqual(20_000);
    expect(generated.report.maxLegSpeedKmh).toBeLessThanOrEqual(25_000);
  });

  it('stops when a leg cannot meet the speed limit', () => {
    expect(() => generateRoute(candidates, { ...config, maxLegSpeedKmh: 1, p90LegSpeedMaxKmh: 1 }))
      .toThrow(/No candidate can be reached|No route ordering satisfies/);
  });

  it('treats the candidate pool as options and respects the country stop ceiling', () => {
    const sameCountry = candidates.slice(0, 2).map((place) => ({ ...place, country: 'FJ' }));
    const generated = generateRoute(sameCountry, { ...config, maxStopsPerCountry: 1 });
    expect(generated.locations).toHaveLength(1);
    expect(generated.report.count).toBe(1);
    expect(generated.report.countriesCovered).toBe(1);
  });
});
