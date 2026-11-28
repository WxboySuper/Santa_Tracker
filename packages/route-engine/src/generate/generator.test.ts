import { describe, expect, it } from 'vitest';
import { createLocationId, SCHEMA_VERSION, type LegacyRouteNode, type Route } from '@santa-tracker/contracts';
import { legSpeedKmh } from '../geo';
import { generateRoute, type Candidate, DEFAULT_GENERATOR_LIMITS } from './generator';
import { isInChristmasWindow, localClock } from './sweep';
import { scheduledTravelMilliseconds } from './order';
import { NORTH_POLE } from './types';
import { deriveJourneyStats, interpolatePresentsDeliveredFromRouteNodes, PRESENTS_TOTAL, type RouteStatsLocation } from '../stats';

const candidates: Candidate[] = [
  { id: 'pacific-a', name: 'Pacific A', country: 'FJ', lat: 80, lng: 170, timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 1_200_000, category: 'hub' },
  { id: 'pacific-b', name: 'Pacific B', country: 'WS', lat: 80, lng: 150, timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 200_000, category: 'hub' },
  { id: 'pacific-c', name: 'Pacific C', country: 'TO', lat: 80, lng: 130, timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 20_000, category: 'hub' },
  { id: 'pacific-d', name: 'Pacific D', country: 'NZ', lat: 80, lng: 110, timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 100, category: 'hub' },
];

const config = { ...DEFAULT_GENERATOR_LIMITS, useOrienteering: false, maxStopsPerCountry: 6, minStopSeparationKm: 20 };

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

  it('allocates the full presents estimate across delivery stops', () => {
    const generated = generateRoute(candidates, config);
    const deliveries = generated.document.route_nodes
      .filter((node) => (node as { type?: string }).type === 'DELIVERY')
      .map((node) => (node as { stop_experience: { presents: number } }).stop_experience.presents);

    expect(deliveries).toHaveLength(generated.report.count);
    expect(deliveries.every((count) => Number.isSafeInteger(count) && count > 0)).toBe(true);
    expect(deliveries.reduce((sum, count) => sum + count, 0)).toBe(PRESENTS_TOTAL);
    expect(new Set(deliveries).size).toBeGreaterThan(1);
  });

  it('matches allocated route-node presents to journey stats across flight and dwell times', () => {
    const generated = generateRoute(candidates, config);
    const nodes = generated.document.route_nodes as LegacyRouteNode[];
    const candidateById = new Map(candidates.map((place) => [place.id, place]));
    const route: Route = {
      schemaVersion: SCHEMA_VERSION,
      season: 2026,
      stops: nodes.map((node) => ({
        locationId: createLocationId(node.id),
        arrivalIso: node.schedule.arrival_utc ?? node.schedule.departure_utc!,
        departureIso: node.schedule.departure_utc!,
        durationSeconds: node.stop_experience.duration_seconds ?? 0,
      })),
    };
    const locations: RouteStatsLocation[] = nodes.map((node) => {
      const candidate = node.candidate_id ? candidateById.get(node.candidate_id) : undefined;
      return {
        id: node.id,
        name: node.location.name,
        country: candidate?.country ?? 'Arctic',
        ...(candidate ? { countryCode: candidate.country, population: candidate.population } : {}),
        timezone: candidate?.timezone ?? 'UTC',
        coordinates: { lat: node.location.lat, lng: node.location.lng },
        type: node.type as RouteStatsLocation['type'],
      };
    });
    const deliveryNodes = nodes.filter((node) => node.type === 'DELIVERY');
    const takeoff = Date.parse(nodes[0]!.schedule.departure_utc!);
    const firstArrival = Date.parse(deliveryNodes[0]!.schedule.arrival_utc!);
    const firstDeparture = Date.parse(deliveryNodes[0]!.schedule.departure_utc!);
    const secondArrival = Date.parse(deliveryNodes[1]!.schedule.arrival_utc!);
    const instants = [
      takeoff - 1,
      takeoff + Math.floor((firstArrival - takeoff) / 2),
      firstArrival,
      firstArrival + Math.floor((firstDeparture - firstArrival) / 2),
      firstDeparture,
      firstDeparture + Math.floor((secondArrival - firstDeparture) / 2),
      secondArrival,
      Date.parse(deliveryNodes.at(-1)!.schedule.departure_utc!),
    ];

    for (const instant of instants) {
      expect(interpolatePresentsDeliveredFromRouteNodes(nodes, instant)).toBe(
        deriveJourneyStats(route, instant, locations, candidates.map((place): RouteStatsLocation => ({
          id: place.id,
          name: place.name,
          country: place.country,
          countryCode: place.country,
          timezone: place.timezone,
          coordinates: { lat: place.lat, lng: place.lng },
          population: place.population,
          type: 'DELIVERY',
        }))).presentsDelivered,
      );
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

  it('collects invalid timezone offsets in the no-tables candidate path', () => {
    const invalidOffset = { ...candidates[1]!, id: 'bad-offset', country: 'FJ', utcOffsetMinutes: 900 };
    const generated = generateRoute([candidates[0]!, invalidOffset], config);
    expect(generated.report.count).toBe(1);
    expect(generated.report.invalidCandidateIds).toContain('bad-offset');
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
    expect(node.transit_to_here.speed_kmh).toBe(Math.round(legSpeedKmh(NORTH_POLE, lateWindowStop, expectedTravelSeconds) ?? 0));
    expect(generated.report.legs[0]?.kmh).toBe(legSpeedKmh(NORTH_POLE, lateWindowStop, scheduleGapSeconds));
    expect(node.transit_to_here.speed_kmh).toBeGreaterThan(Math.round(generated.report.legs[0]!.kmh));
  });

  it('reports an invalid candidate IANA timezone without aborting remaining valid places', () => {
    const invalidTimezoneCandidate = { ...candidates[0]!, id: 'bad-timezone', country: 'WS', timezone: 'Not/A_Zone' };
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'] },
      zonePointsByCountry: { FJ: [{ timezone: 'Pacific/Kiritimati', lat: 80, lng: 170 }] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 840 },
      countryNames: { FJ: 'Fiji' },
    };
    const generated = generateRoute([candidates[0]!, invalidTimezoneCandidate], config, {}, tables);
    expect(generated.report.count).toBe(1);
    expect(generated.report.invalidCandidateIds).toEqual(['bad-timezone']);
    expect(generated.report.candidateCount).toBe(2);
    expect(generated.report.unselectedCandidateCount).toBe(1);
    expect(generated.report.uncoveredCountryCodes).toContain('WS');
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

  it('fails fast for an invalid timezone override', () => {
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'], WS: ['Pacific/Kiritimati'] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 840 },
    };
    expect(() => generateRoute(candidates.slice(0, 2), config, { timezone: { 'pacific-a': 'Not/A_Zone' } }, tables))
      .toThrow('Invalid IANA timezone override for Pacific A: Not/A_Zone');
  });

  it('fails fast when a timezone override does not match its country', () => {
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'], WS: ['Pacific/Apia'] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 840, 'Pacific/Apia': 780 },
    };
    expect(() => generateRoute(candidates.slice(0, 2), config, { timezone: { 'pacific-a': 'America/New_York' } }, tables))
      .toThrow('Timezone override America/New_York for Pacific A does not belong to country FJ');
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

  it('normalizes stale source offsets from the committed timezone snapshot', () => {
    const staleOffset = { ...candidates[0]!, id: 'stale-source-offset', utcOffsetMinutes: 780 };
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'] },
      zonePointsByCountry: { FJ: [{ timezone: 'Pacific/Kiritimati', lat: 80, lng: 170 }] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 840 },
      countryNames: { FJ: 'Fiji' },
    };
    const generated = generateRoute([staleOffset], config, {}, tables);
    expect(generated.locations[0]?.utcOffsetMinutes).toBe(840);
    expect(generated.report.invalidCandidateIds).toEqual([]);
  });

  it('accepts an explicit offset override that matches IANA at the arrival time', () => {
    const candidate = { ...candidates[0]!, id: 'iana-validated-override', utcOffsetMinutes: 780 };
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'] },
      zonePointsByCountry: { FJ: [{ timezone: 'Pacific/Kiritimati', lat: 80, lng: 170 }] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 780 },
      countryNames: { FJ: 'Fiji' },
    };
    const generated = generateRoute([candidate], config,
      { utcOffsetMinutes: { 'iana-validated-override': 840 } }, tables);

    expect(generated.locations[0]?.utcOffsetMinutes).toBe(840);
    expect(generated.report.invalidCandidateIds).toEqual([]);
  });

  it('rejects an explicit UTC offset override that disagrees with the resolved timezone', () => {
    const mismatched = { ...candidates[0]!, id: 'mismatched-offset-override', timezone: 'America/New_York' };
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'] },
      zonePointsByCountry: { FJ: [{ timezone: 'Pacific/Kiritimati', lat: 80, lng: 170 }] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 840 },
      countryNames: { FJ: 'Fiji' },
    };
    const generated = generateRoute([candidates[0]!, mismatched], config,
      { utcOffsetMinutes: { 'mismatched-offset-override': 720 } }, tables);
    expect(generated.locations.map((place) => place.id)).toEqual(['pacific-a']);
    expect(generated.report.invalidCandidateIds).toEqual(['mismatched-offset-override']);
    expect(generated.report.issues).toContain('Invalid candidate row skipped: mismatched-offset-override');
  });

  it.each([720.5, -721, 841])('reports an invalid UTC offset override %s as a malformed candidate', (offset) => {
    const mismatched = { ...candidates[0]!, id: 'invalid-offset-override', timezone: 'America/New_York' };
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'] },
      zonePointsByCountry: { FJ: [{ timezone: 'Pacific/Kiritimati', lat: 80, lng: 170 }] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 840 },
      countryNames: { FJ: 'Fiji' },
    };
    const generated = generateRoute([candidates[0]!, mismatched], config,
      { utcOffsetMinutes: { 'invalid-offset-override': offset } }, tables);
    expect(generated.report.invalidCandidateIds).toContain('invalid-offset-override');
    expect(generated.locations.map((place) => place.id)).not.toContain('invalid-offset-override');
  });

  it('recovers a missing snapshot offset from the committed offset table', () => {
    const { utcOffsetMinutes: _offset, ...candidateWithoutOffset } = candidates[0]!;
    const missingOffset = { ...candidateWithoutOffset, id: 'missing-snapshot-offset' };
    const tables = {
      zonesByCountry: { FJ: ['Pacific/Kiritimati'] },
      zonePointsByCountry: { FJ: [{ timezone: 'Pacific/Kiritimati', lat: 80, lng: 170 }] },
      utcOffsetsByTimezone: { 'Pacific/Kiritimati': 840 },
      countryNames: { FJ: 'Fiji' },
    };
    const generated = generateRoute([candidates[0]!, missingOffset], config, {}, tables);
    expect(generated.locations.map((place) => place.id)).toContain('missing-snapshot-offset');
    expect(generated.locations.find((place) => place.id === 'missing-snapshot-offset')?.utcOffsetMinutes).toBe(840);
    expect(generated.report.invalidCandidateIds).toEqual([]);
  });

  it('keeps duplicate IDs raw in the report and describes the duplicate separately', () => {
    const duplicate = { ...candidates[0]!, name: 'Duplicate Pacific A' };
    const generated = generateRoute([candidates[0]!, duplicate], config);
    expect(generated.report.invalidCandidateIds).toEqual([]);
    expect(generated.report.issues).toContain('Duplicate candidate ID skipped: pacific-a');
  });
});
