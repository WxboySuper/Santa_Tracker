import { describe, expect, it } from 'vitest';
import { generateRoute, type Candidate, DEFAULT_GENERATOR_LIMITS } from './generator';
import { isInChristmasWindow, localClock } from './sweep';
import { scheduledTravelMilliseconds } from './order';
import { NORTH_POLE } from './types';

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

  it('rejects invalid category weights before planning the sweep', () => {
    const invalidWeights: Record<string, number>[] = [
      {},
      { hub: -1 },
      { hub: Number.NaN },
      { hub: Number.POSITIVE_INFINITY },
      { hub: 0, cultural: 0 },
      { hub: Number.MAX_VALUE, cultural: Number.MAX_VALUE },
    ];
    for (const weights of invalidWeights) {
      expect(() => generateRoute(candidates, { ...config, weights })).toThrow(/Category weights/);
    }
  });

  it('treats the candidate pool as options and respects the country stop ceiling', () => {
    const sameCountry = candidates.slice(0, 2).map((place) => ({ ...place, country: 'FJ' }));
    const generated = generateRoute(sameCountry, { ...config, maxStopsPerCountry: 1 });
    expect(generated.locations).toHaveLength(1);
    expect(generated.report.count).toBe(1);
    expect(generated.report.countriesCovered).toBe(1);
  });

  it('skips and reports a malformed raw candidate while generating the valid route', () => {
    const generated = generateRoute([candidates[0]!, null as unknown as Candidate], config);
    expect(generated.report.count).toBe(1);
    expect(generated.report.invalidCandidateIds).toEqual(['row-2']);
    expect(generated.report.issues).toContain('Invalid candidate row skipped: row-2');
  });

  it('records flight time and speed separately from a local-window wait', () => {
    const lateWindowStop: Candidate = {
      id: 'late-window-stop', name: 'Late Window Stop', country: 'US', lat: 70, lng: 170,
      timezone: 'Etc/GMT+12', utcOffsetMinutes: -720, category: 'populated', population: 5_000,
    };
    const generated = generateRoute([lateWindowStop], config);
    const node = generated.document.route_nodes[1] as { transit_to_here: { duration_seconds: number; speed_kmh: number } };
    const expectedTravelSeconds = scheduledTravelMilliseconds(NORTH_POLE, lateWindowStop, config) / 1000;
    const scheduleGapSeconds = (Date.parse(generated.route.stops[0]!.arrivalIso) - Date.parse('2026-12-24T10:00:00.000Z')) / 1000;
    expect(scheduleGapSeconds).toBeGreaterThan(expectedTravelSeconds);
    expect(node.transit_to_here.duration_seconds).toBe(expectedTravelSeconds);
    expect(node.transit_to_here.speed_kmh).toBe(Math.round(generated.report.legs[0]!.kmh));
  });

  it('reports an invalid candidate IANA timezone without aborting remaining valid places', () => {
    const invalidTimezoneCandidate = { ...candidates[0]!, id: 'bad-timezone', timezone: 'Not/A_Zone' };
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'] },
      zonePointsByCountry: { FJ: [{ timezone: 'Pacific/Kiritimati', lat: 80, lng: 170 }] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 840 },
      countryNames: { FJ: 'Fiji' },
    };
    const generated = generateRoute([candidates[0]!, invalidTimezoneCandidate], config, {}, tables);
    expect(generated.report.count).toBe(1);
    expect(generated.report.invalidCandidateIds).toEqual(['bad-timezone']);
  });

  it('reports a timezone mismatch when the country table has no recovery point', () => {
    const unrecoverable = { ...candidates[0]!, id: 'unrecoverable-zone', timezone: 'America/New_York' };
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'] },
      zonePointsByCountry: { FJ: [] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 840 },
      countryNames: { FJ: 'Fiji' },
    };
    const generated = generateRoute([candidates[0]!, unrecoverable], config, {}, tables);
    expect(generated.report.count).toBe(1);
    expect(generated.report.invalidCandidateIds).toEqual(['unrecoverable-zone']);
  });

  it('reports an invalid timezone override and continues with valid candidates', () => {
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'], WS: ['Pacific/Kiritimati'] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 840 },
    };
    const generated = generateRoute(candidates.slice(0, 2), config, { timezone: { 'pacific-a': 'Not/A_Zone' } }, tables);
    expect(generated.report.invalidCandidateIds).toEqual(['pacific-a']);
    expect(generated.locations.map((place) => place.id)).toEqual(['pacific-b']);
  });

  it('recovers a missing UTC offset before candidate validation when timezone tables can resolve it', () => {
    const { utcOffsetMinutes: _offset, ...candidateWithoutOffset } = candidates[0]!;
    const recoverable = { ...candidateWithoutOffset, id: 'recoverable-offset', timezone: 'Etc/UTC' };
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'] },
      zonePointsByCountry: { FJ: [{ timezone: 'Pacific/Kiritimati', lat: 80, lng: 170 }] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 840 },
      countryNames: { FJ: 'Fiji' },
    };
    const generated = generateRoute([recoverable], config, {}, tables);
    expect(generated.locations[0]?.utcOffsetMinutes).toBe(840);
    expect(generated.report.invalidCandidateIds).toEqual([]);
  });

  it('reports a missing snapshot offset when its valid timezone cannot recover it', () => {
    const { utcOffsetMinutes: _offset, ...candidateWithoutOffset } = candidates[0]!;
    const missingOffset = { ...candidateWithoutOffset, id: 'missing-snapshot-offset' };
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'] },
      zonePointsByCountry: { FJ: [{ timezone: 'Pacific/Kiritimati', lat: 80, lng: 170 }] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 840 },
      countryNames: { FJ: 'Fiji' },
    };
    const generated = generateRoute([candidates[0]!, missingOffset], config, {}, tables);
    expect(generated.report.invalidCandidateIds).toEqual(['missing-snapshot-offset']);
    expect(generated.report.issues).toContain('Invalid candidate row skipped: missing-snapshot-offset');
  });

  it('keeps duplicate IDs raw in the report and describes the duplicate separately', () => {
    const duplicate = { ...candidates[0]!, name: 'Duplicate Pacific A' };
    const generated = generateRoute([candidates[0]!, duplicate], config);
    expect(generated.report.invalidCandidateIds).toEqual(['pacific-a']);
    expect(generated.report.issues).toContain('Duplicate candidate ID skipped: pacific-a');
  });
});
