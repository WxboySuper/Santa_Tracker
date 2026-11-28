import { describe, expect, it } from 'vitest';
import { auditRouteDocument, coordinateAuditFailures } from './audit';
import { localWindowStatus } from './sweep';
import { DEFAULT_GENERATOR_LIMITS } from './types';
import type { Candidate, GeneratorConfig } from './types';

type AuditTestConfig = GeneratorConfig & {
  requiredStopIds: string[];
  requiredCountries: string[];
  useOrienteering: boolean;
};

function routeFixture(points: { id: string; name: string; lng: number; country?: string; offset?: number; reason?: string; routeReason?: string; population?: number; category?: string; arrivalUtc?: string; status?: string; tier?: string; duration?: number; transitSeconds?: number }[]): { document: unknown; selected: Candidate[] } {
  const selected = points.map((point) => ({ id: point.id, name: point.name, country: point.country ?? 'US', timezone: 'Etc/UTC', utcOffsetMinutes: point.offset ?? 0,
    category: point.category ?? 'populated', population: point.population ?? 1000, lat: 0, lng: point.lng }));
  const start = { id: 'start', type: 'START', location: { name: 'North Pole', region: 'Arctic', lat: 80, lng: 180 }, schedule: { arrival_utc: null, departure_utc: '2026-12-24T10:00:00.000Z' }, stop_experience: {}, transit_to_here: null };
  const deliveries = points.map((point, index) => {
    const defaultArrival = new Date(Date.parse('2026-12-24T23:20:00.000Z') + index * 10 * 60_000).toISOString();
    const arrival = point.arrivalUtc ?? defaultArrival;
    return {
      id: point.id, type: 'DELIVERY', candidate_id: point.id,
      location: { name: point.name, region: 'Test', country_code: point.country ?? 'US', timezone: 'Etc/UTC', timezone_offset: (point.offset ?? 0) / 60, lat: 0, lng: point.lng },
      schedule: {
        arrival_utc: arrival,
        departure_utc: new Date(Date.parse(arrival) + 30_000).toISOString(),
        time_window_status: point.status ?? localWindowStatus({ instant: Date.parse(arrival), offsetMinutes: point.offset ?? 0 }),
      },
      stop_experience: { presents_delivered_at_stop: 1, camera_zoom: 1, weather_condition: 'clear', stop_tier: point.tier ?? 'town', duration_seconds: point.duration ?? 10 },
      transit_to_here: { duration_seconds: point.transitSeconds ?? 0, distance_km: 1, speed_kmh: 100,
        ...(point.reason ? { eastward_reason: point.reason } : {}), ...(point.routeReason ? { route_reason: point.routeReason } : {}) },
      notes: 'https://www.wikidata.org/wiki/Q1',
    };
  });
  const end = { ...start, id: 'end', type: 'END', schedule: { arrival_utc: '2026-12-25T01:00:00.000Z', departure_utc: '2026-12-25T01:00:00.000Z' }, transit_to_here: { duration_seconds: 0, distance_km: 1, speed_kmh: 100, eastward_reason: 'return' } };
  return { document: { meta: { route_version: '2026-draft-1', generated_at: DEFAULT_GENERATOR_LIMITS.generatedAt }, route_nodes: [start, ...deliveries, end] }, selected };
}

function auditFixture(fixture: ReturnType<typeof routeFixture>, useOrienteering = false) {
  const result = auditRouteDocument(fixture.document, {
    config: { ...DEFAULT_GENERATOR_LIMITS, useOrienteering, weights: { hub: 100 }, requiredStopIds: [], requiredCountries: [] } as AuditTestConfig,
    pool: fixture.selected, selected: fixture.selected, zonesByCountry: { US: ['Etc/UTC'] }, utcOffsetsByTimezone: { 'Etc/UTC': 0 },
    countryBoundsByCode: { US: { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 }, CA: { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 } }, report: { continentBalance: {}, subregionBalance: {} }, vetoIds: [],
  });
  return result.checks;
}

describe('auditRouteDocument', () => {
  it('reports missing nodes and home endpoints as failures', () => {
    const result = auditRouteDocument({}, {
      config: {
        ...DEFAULT_GENERATOR_LIMITS,
        weights: { hub: 100 },
        requiredStopIds: ['required-stop'],
        requiredCountries: ['US'],
      } as AuditTestConfig,
      pool: [],
      selected: [],
      zonesByCountry: {},
      utcOffsetsByTimezone: {},
      countryBoundsByCode: {},
      report: { continentBalance: {}, subregionBalance: {} },
      vetoIds: [],
    });

    expect(result.pass).toBe(false);
    expect(result.checks.find((check) => check.name === 'Legacy route schema')?.pass).toBe(false);
    expect(result.checks.find((check) => check.name === 'North Pole start and end')?.pass).toBe(false);
    expect(result.checks.some((check) => check.name === 'Required iconic and regional stops')).toBe(false);
  });

  it('rejects a stop outside its country bounds and an alternate-source coordinate mismatch', () => {
    const naturalEarth = {
      id: 'ne-1', name: 'Sample Town', country: 'AA', timezone: 'Etc/UTC',
      lat: 8, lng: 8, category: 'underserved', source: 'https://www.naturalearthdata.com/downloads/place',
    };
    const wikidata = {
      ...naturalEarth, id: 'Q1', lat: 2, lng: 2, source: 'https://www.wikidata.org/wiki/Q1',
    };
    const failures = coordinateAuditFailures([naturalEarth], [naturalEarth, wikidata], {
      AA: { minLat: 0, maxLat: 5, minLng: 0, maxLng: 5 },
    });
    expect(failures).toHaveLength(2);
    expect(failures.join('; ')).toContain('outside the AA country bounds');
    expect(failures.join('; ')).toContain('alternate-source Q1');
  });

  it('rejects damaged names and labels and country codes without explicit regions', () => {
    const result = auditRouteDocument({ route_nodes: [
      {
        id: 'stop-1', type: 'DELIVERY', candidate_id: 'missing-1',
        location: { name: 'Troms?', country_code: 'NO', lat: 69.65, lng: 18.96 },
        schedule: { arrival_utc: '2026-12-24T23:40:00.000Z', departure_utc: '2026-12-24T23:41:00.000Z' },
      },
      {
        id: 'stop-2', type: 'DELIVERY', candidate_id: 'missing-2', label: 'N\uFFFDdi',
        location: { name: 'Nadi', country_code: 'FJ', lat: -17.78, lng: 177.44 },
        schedule: { arrival_utc: '2026-12-24T23:45:00.000Z', departure_utc: '2026-12-24T23:46:00.000Z' },
      },
      {
        id: 'stop-3', type: 'DELIVERY', candidate_id: 'missing-3',
        location: { name: 'Unknown region', country_code: 'ZZ', lat: 0, lng: 0 },
        schedule: { arrival_utc: '2026-12-24T23:50:00.000Z', departure_utc: '2026-12-24T23:51:00.000Z' },
      },
    ] }, {
      config: { ...DEFAULT_GENERATOR_LIMITS, weights: { hub: 100 }, requiredStopIds: ['required-stop'], requiredCountries: ['US'] } as AuditTestConfig,
      pool: [],
      selected: [],
      zonesByCountry: {},
      utcOffsetsByTimezone: {},
      countryBoundsByCode: {},
      report: { continentBalance: {}, subregionBalance: {} },
      vetoIds: [],
    });

    const check = result.checks.find((entry) => entry.name === 'Clean names and explicit region mappings');
    expect(check?.pass).toBe(false);
    expect(check?.detail).toContain("Troms?");
    expect(check?.detail).toContain('U+FFFD');
    expect(check?.detail).toContain('ZZ');
  });

  it('allows short eastward hops without a recorded reason', () => {
    const unexplained = auditFixture(routeFixture([
    { id: 'a', name: 'A', lng: -100 }, { id: 'b', name: 'B', lng: -90 },
    ]));
    expect(unexplained.find((check) => check.name === 'Eastward legs')?.pass).toBe(true);
  });

  it('requires a reason for long eastward legs', () => {
    const longUnexplained = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: -100 }, { id: 'b', name: 'B', lng: -75 },
    ]));
    expect(longUnexplained.find((check) => check.name === 'Eastward legs')?.pass).toBe(false);
    const softChoice = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: -100 }, { id: 'b', name: 'B', lng: -75, reason: 'soft-orienteering' },
    ]), true);
    expect(softChoice.find((check) => check.name === 'Eastward legs')?.pass).toBe(true);
  });

  it('accepts only plausible offset-anomaly reasons', () => {
    const anomaly = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: -100, offset: -300 }, { id: 'b', name: 'B', lng: -75, offset: 300, reason: 'offset-anomaly' },
    ]));
    expect(anomaly.find((check) => check.name === 'Eastward legs')?.pass).toBe(true);
    const wrongAnomaly = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: -100, offset: 300 }, { id: 'b', name: 'B', lng: -75, offset: -300, reason: 'offset-anomaly' },
    ]));
    expect(wrongAnomaly.find((check) => check.name === 'Eastward legs')?.pass).toBe(false);
    const smallOffsetReset = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: 74, offset: 360 }, { id: 'b', name: 'B', lng: 83, offset: 345, reason: 'offset-anomaly' },
    ]));
    expect(smallOffsetReset.find((check) => check.name === 'Eastward legs')?.pass).toBe(true);
  });

  it('accepts a date-line reason only before the sweep crosses the date line', () => {
    const dateline = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: 170, offset: 780 }, { id: 'b', name: 'B', lng: -170, offset: 840, reason: 'dateline' },
    ]));
    expect(dateline.find((check) => check.name === 'Eastward legs')?.pass).toBe(true);
    const lateDateline = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: 170, offset: 720 }, { id: 'b', name: 'B', lng: -170, offset: 780, reason: 'dateline' },
    ]));
    expect(lateDateline.find((check) => check.name === 'Eastward legs')?.pass).toBe(false);
  });

  it('fails geometric detours while treating the only stop for a country as a warning', () => {
    const failure = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: 0 }, { id: 'b', name: 'B', lng: 100 }, { id: 'c', name: 'C', lng: 2 },
    ]));
    expect(failure.find((check) => check.name === 'Detours')?.pass).toBe(false);
    const detour = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: 0 }, { id: 'b', name: 'B', lng: 100, country: 'CA' }, { id: 'c', name: 'C', lng: 2 },
    ]));
    expect(detour.find((check) => check.name === 'Detours')?.pass).toBe(true);
    expect(detour.find((check) => check.name === 'Detours')?.detail).toContain('WARNING B:');
  });

  it('checks local arrival boundaries, travel chronology, speed, and stop tier duration', () => {
    const startOfWindow = auditFixture(routeFixture([{ id: 'a', name: 'A', lng: -100, arrivalUtc: '2026-12-24T23:00:00.000Z' }]));
    expect(startOfWindow.find((check) => check.name === 'Timezone and local arrival window')?.pass).toBe(true);
    const outsideWindow = auditFixture(routeFixture([{ id: 'a', name: 'A', lng: -100, arrivalUtc: '2026-12-24T19:59:00.000Z' }]));
    expect(outsideWindow.find((check) => check.name === 'Timezone and local arrival window')?.pass).toBe(false);

    const earlyArrival = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: -100 }, { id: 'b', name: 'B', lng: -99, transitSeconds: 900, arrivalUtc: '2026-12-24T23:30:00.000Z' },
    ]));
    expect(earlyArrival.find((check) => check.name === 'Travel chronology')?.pass).toBe(false);

    const tierMismatch = auditFixture(routeFixture([{ id: 'a', name: 'A', lng: -100, population: 400_000, tier: 'town', duration: 10 }]));
    expect(tierMismatch.find((check) => check.name === 'Stop tiers and duration')?.pass).toBe(false);
    const tierPass = auditFixture(routeFixture([{ id: 'a', name: 'A', lng: -100, population: 1_200_000, tier: 'major', duration: 30 }]));
    expect(tierPass.find((check) => check.name === 'Stop tiers and duration')?.pass).toBe(true);

    const fastLeg = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: -100 }, { id: 'b', name: 'B', lng: 0, arrivalUtc: '2026-12-24T23:21:00.000Z' },
    ]));
    expect(fastLeg.find((check) => check.name === 'Leg speed')?.pass).toBe(false);
  });

  it('passes the 85 percent preferred-night arrival threshold', () => {
    const hours = Array.from({ length: 10 }, (_, index) => ({
      id: `night-${index}`, name: `Night ${index}`, lng: -120 + index,
      arrivalUtc: index === 9 ? '2026-12-25T12:00:00.000Z' : '2026-12-25T02:00:00.000Z',
    }));
    const result = auditFixture(routeFixture(hours), true);
    expect(result.find((check) => check.name === 'Preferred local-night coverage')?.pass).toBe(true);
  });

  it('counts sovereign states as required and reports optional territories', () => {
    const fixture = routeFixture([{ id: 'us-stop', name: 'US stop', country: 'US', lng: -100 }]);
    const pitcairn = { ...fixture.selected[0]!, id: 'pn-stop', name: 'Adamstown', country: 'PN' };
    const result = auditRouteDocument(fixture.document, {
      config: { ...DEFAULT_GENERATOR_LIMITS, weights: { hub: 100 }, requiredStopIds: [], requiredCountries: [] },
      pool: [...fixture.selected, pitcairn], selected: fixture.selected,
      zonesByCountry: { US: ['Etc/UTC'], PN: ['Pacific/Pitcairn'] }, utcOffsetsByTimezone: { 'Etc/UTC': 0, 'Pacific/Pitcairn': -480 },
      countryBoundsByCode: { US: { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 }, PN: { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 } },
      report: { continentBalance: {}, subregionBalance: {} }, vetoIds: [],
    });
    expect(result.checks.find((check) => check.name === 'Sovereign-state coverage')?.pass).toBe(true);
    expect(result.reports.find((report) => report.name === 'Territory coverage')?.detail).toContain('skipped 1 (PN)');
  });

  it('fails below the 85 percent preferred-night arrival threshold', () => {
    const hours = Array.from({ length: 10 }, (_, index) => ({
      id: `night-${index}`, name: `Night ${index}`, lng: -120 + index,
      arrivalUtc: index < 8 ? '2026-12-25T02:00:00.000Z' : '2026-12-25T12:00:00.000Z',
    }));
    const result = auditFixture(routeFixture(hours), true);
    expect(result.find((check) => check.name === 'Preferred local-night coverage')?.pass).toBe(false);
  });

  it('accepts allowed shoulders and rejects arrivals outside the hard window', () => {
    const preferredAndShoulder = Array.from({ length: 10 }, (_, index) => ({
      id: `night-${index}`, name: `Night ${index}`, lng: -120 + index,
      arrivalUtc: index === 9 ? '2026-12-24T22:45:00.000Z' : '2026-12-25T02:00:00.000Z',
    }));
    const shoulder = auditFixture(routeFixture(preferredAndShoulder), true);
    expect(shoulder.find((check) => check.name === 'Preferred local-night coverage')?.pass).toBe(true);
    expect(shoulder.find((check) => check.name === 'Timezone and local arrival window')?.pass).toBe(true);
    const outsideShoulder = auditFixture(routeFixture([{ id: 'outside', name: 'Outside shoulder', lng: -100,
      arrivalUtc: '2026-12-24T22:29:00.000Z' }]), true);
    expect(outsideShoulder.find((check) => check.name === 'Timezone and local arrival window')?.pass).toBe(false);
  });

  it('rejects a window label that disagrees with the recorded local time', () => {
    const mislabeled = auditFixture(routeFixture([{ id: 'label', name: 'Wrong label', lng: -100,
      arrivalUtc: '2026-12-25T12:00:00.000Z', status: 'GREEN' }]), true);
    expect(mislabeled.find((check) => check.name === 'Local time-window status labels')?.pass).toBe(false);
    expect(mislabeled.find((check) => check.name === 'Timezone and local arrival window')?.pass).toBe(false);
  });

  it('caps single-country and combined US+CA shares', () => {
    const points = [
      { id: 'us-1', name: 'US one', lng: -110, country: 'US' },
      { id: 'us-2', name: 'US two', lng: -100, country: 'US' },
      { id: 'ca-1', name: 'Canada one', lng: -90, country: 'CA' },
      { id: 'mx-1', name: 'Mexico one', lng: -80, country: 'MX' },
      { id: 'br-1', name: 'Brazil one', lng: -70, country: 'BR' },
    ];
    const result = auditFixture(routeFixture(points), true);
    expect(result.find((check) => check.name === 'Country stop-share caps')?.pass).toBe(false);
    expect(result.find((check) => check.name === 'Country stop-share caps')?.detail).toContain('US and CA');
  });

  it('reports repeated long north-south reversals and requires reasons for legs over 4,000 km', () => {
    const points = [
      { id: 'a', name: 'A', lng: 0 }, { id: 'b', name: 'B', lng: 1 },
      { id: 'c', name: 'C', lng: 2 }, { id: 'd', name: 'D', lng: 3 }, { id: 'e', name: 'E', lng: 4 },
    ];
    const fixture = routeFixture(points);
    const nodes = (fixture.document as { route_nodes: { location: { lat: number }; transit_to_here?: { route_reason?: string } }[] }).route_nodes;
    nodes[1]!.location.lat = 0;
    nodes[2]!.location.lat = 40;
    nodes[3]!.location.lat = 0;
    nodes[4]!.location.lat = 40;
    nodes[5]!.location.lat = 0;
    fixture.selected.forEach((place, index) => { place.lat = index % 2 === 0 ? 0 : 40; });
    const result = auditRouteDocument(fixture.document, {
      config: { ...DEFAULT_GENERATOR_LIMITS, useOrienteering: true, weights: { hub: 100 }, requiredStopIds: [], requiredCountries: [] } as AuditTestConfig,
      pool: fixture.selected, selected: fixture.selected, zonesByCountry: { US: ['Etc/UTC'] }, utcOffsetsByTimezone: { 'Etc/UTC': 0 },
      countryBoundsByCode: { US: { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 } }, report: { continentBalance: {}, subregionBalance: {} }, vetoIds: [],
    });
    expect(result.checks.find((check) => check.name === 'Repeated north-south reversals')?.pass).toBe(false);
    expect(result.checks.find((check) => check.name === 'Reasons for legs over 4,000 km')?.pass).toBe(false);
  });

  it('does not join distant north-south swings across short local legs', () => {
    const points = [
      { id: 'a', name: 'A', lng: 0 }, { id: 'b', name: 'B', lng: 1 },
      { id: 'c', name: 'C', lng: 2 }, { id: 'd', name: 'D', lng: 3 },
      { id: 'e', name: 'E', lng: 4 }, { id: 'f', name: 'F', lng: 5 },
    ];
    const fixture = routeFixture(points);
    const nodes = (fixture.document as { route_nodes: { location: { lat: number } }[] }).route_nodes;
    [0, 40, 40.1, 0, 0.1, 40].forEach((latitude, index) => { nodes[index + 1]!.location.lat = latitude; });
    fixture.selected.forEach((place, index) => { place.lat = [0, 40, 40.1, 0, 0.1, 40][index]!; });
    const result = auditRouteDocument(fixture.document, {
      config: { ...DEFAULT_GENERATOR_LIMITS, useOrienteering: true, weights: { hub: 100 }, requiredStopIds: [], requiredCountries: [] } as AuditTestConfig,
      pool: fixture.selected, selected: fixture.selected, zonesByCountry: { US: ['Etc/UTC'] }, utcOffsetsByTimezone: { 'Etc/UTC': 0 },
      countryBoundsByCode: { US: { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 } }, report: { continentBalance: {}, subregionBalance: {} }, vetoIds: [],
    });
    expect(result.checks.find((check) => check.name === 'Repeated north-south reversals')?.pass).toBe(true);
  });

  it('enforces the owner-updated 20 km minimum stop separation', () => {
    const tooClose = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: -100 }, { id: 'b', name: 'B', lng: -99.9 },
    ]));
    expect(tooClose.find((check) => check.name === 'Vetoes, coordinates, duplicates, and separation')?.pass).toBe(false);
    const separated = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: -100 }, { id: 'b', name: 'B', lng: -99.7 },
    ]));
    expect(separated.find((check) => check.name === 'Vetoes, coordinates, duplicates, and separation')?.pass).toBe(true);
  });

  it('accepts a recorded mandatory country-coverage spacing exception', () => {
    const fixture = routeFixture([
      { id: 'a', name: 'Required country A', lng: 0, routeReason: 'mandatory-country-coverage-spacing-exception' },
      { id: 'b', name: 'Required country B', lng: 0.05 },
      { id: 'c', name: 'Other stop', lng: 0.5 },
    ]);
    expect(auditFixture(fixture).find((check) => check.name === 'Vetoes, coordinates, duplicates, and separation')?.pass).toBe(true);
  });

  it('requires a reason for eastward legs over 1,500 km in hard-rule mode', () => {
    const fixture = routeFixture([
      { id: 'a', name: 'Origin', lng: 0 },
      { id: 'b', name: 'Eastward destination', lng: 20 },
    ]);
    const result = auditFixture(fixture);
    expect(result.find((check) => check.name === 'Eastward legs')?.pass).toBe(false);
  });

  it('rejects generic long-leg reasons and accepts a specific checked reason', () => {
    const generic = routeFixture([
      { id: 'origin', name: 'Origin', lng: 0, country: 'US', routeReason: 'ocean-crossing' },
      { id: 'destination', name: 'Destination', lng: 50, country: 'CA', routeReason: 'cross-border-coverage' },
    ]);
    const genericResult = auditFixture(generic, true);
    expect(genericResult.find((check) => check.name === 'Reasons for legs over 4,000 km')?.pass).toBe(false);

    const specific = routeFixture([
      { id: 'origin', name: 'Origin', lng: 0, country: 'US', routeReason: 'polar launch to US; best feasible insertion checked' },
      { id: 'destination', name: 'Destination', lng: 50, country: 'CA',
        routeReason: 'ocean crossing US to CA for mandatory country/admin-1 coverage; best feasible insertion checked' },
    ]);
    const nodes = (specific.document as { route_nodes: { transit_to_here?: { route_reason?: string } }[] }).route_nodes;
    nodes.at(-1)!.transit_to_here = { route_reason: 'polar return from CA' };
    const specificResult = auditFixture(specific, true);
    expect(specificResult.find((check) => check.name === 'Reasons for legs over 4,000 km')?.pass).toBe(true);
  });

  it('fails repeated-country detours in hard-rule mode', () => {
    const fixture = routeFixture([
      { id: 'a', name: 'Origin', lng: 0 },
      { id: 'b', name: 'Detour', lng: 10 },
      { id: 'c', name: 'Destination', lng: 1 },
    ]);
    expect(auditFixture(fixture).find((check) => check.name === 'Detours')?.pass).toBe(false);
  });
});
