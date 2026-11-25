import { describe, expect, it } from 'vitest';
import { auditRouteDocument, coordinateAuditFailures } from './audit';
import { DEFAULT_GENERATOR_LIMITS } from './types';
import type { Candidate } from './types';

function routeFixture(points: { id: string; name: string; lng: number; country?: string; offset?: number; reason?: string; population?: number; category?: string; arrivalUtc?: string; tier?: string; duration?: number; transitSeconds?: number }[]): { document: unknown; selected: Candidate[] } {
  const selected = points.map((point) => ({ id: point.id, name: point.name, country: point.country ?? 'US', timezone: 'Etc/UTC', utcOffsetMinutes: point.offset ?? 0,
    category: point.category ?? 'populated', population: point.population ?? 1000, lat: 0, lng: point.lng }));
  const start = { id: 'start', type: 'START', location: { name: 'North Pole', region: 'Arctic', lat: 80, lng: 180 }, schedule: { arrival_utc: null, departure_utc: '2026-12-24T10:00:00.000Z' }, stop_experience: {}, transit_to_here: null };
  const deliveries = points.map((point, index) => ({
    id: point.id, type: 'DELIVERY', candidate_id: point.id,
    location: { name: point.name, region: 'Test', country_code: point.country ?? 'US', timezone: 'Etc/UTC', timezone_offset: 0, lat: 0, lng: point.lng },
    schedule: { arrival_utc: point.arrivalUtc ?? `2026-12-24T23:${String(20 + index * 10).padStart(2, '0')}:00.000Z`, departure_utc: point.arrivalUtc ? new Date(Date.parse(point.arrivalUtc) + 30_000).toISOString() : `2026-12-24T23:${String(20 + index * 10).padStart(2, '0')}:30.000Z` },
    stop_experience: { presents_delivered_at_stop: 1, camera_zoom: 1, weather_condition: 'clear', stop_tier: point.tier ?? 'town', duration_seconds: point.duration ?? 10 },
    transit_to_here: { duration_seconds: point.transitSeconds ?? 0, distance_km: 1, speed_kmh: 100, ...(point.reason ? { eastward_reason: point.reason } : {}) },
    notes: 'https://www.wikidata.org/wiki/Q1',
  }));
  const end = { ...start, id: 'end', type: 'END', schedule: { arrival_utc: '2026-12-25T01:00:00.000Z', departure_utc: '2026-12-25T01:00:00.000Z' }, transit_to_here: { duration_seconds: 0, distance_km: 1, speed_kmh: 100, eastward_reason: 'return' } };
  return { document: { meta: { route_version: '2026-draft-1', generated_at: DEFAULT_GENERATOR_LIMITS.generatedAt }, route_nodes: [start, ...deliveries, end] }, selected };
}

function auditFixture(fixture: ReturnType<typeof routeFixture>) {
  const result = auditRouteDocument(fixture.document, {
    config: { ...DEFAULT_GENERATOR_LIMITS, weights: { hub: 100 } },
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
      },
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
      config: { ...DEFAULT_GENERATOR_LIMITS, weights: { hub: 100 } },
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

  it('fails an unexplained eastward leg and passes an offset anomaly only when destination midnight is earlier', () => {
    const unexplained = auditFixture(routeFixture([
    { id: 'a', name: 'A', lng: -100 }, { id: 'b', name: 'B', lng: -90 },
    ]));
    expect(unexplained.find((check) => check.name === 'Eastward legs')?.pass).toBe(false);
    const anomaly = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: -100, offset: -300 }, { id: 'b', name: 'B', lng: -90, offset: 300, reason: 'offset-anomaly' },
    ]));
    expect(anomaly.find((check) => check.name === 'Eastward legs')?.pass).toBe(true);
    const wrongAnomaly = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: -100, offset: 300 }, { id: 'b', name: 'B', lng: -90, offset: -300, reason: 'offset-anomaly' },
    ]));
    expect(wrongAnomaly.find((check) => check.name === 'Eastward legs')?.pass).toBe(false);

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
    const outsideWindow = auditFixture(routeFixture([{ id: 'a', name: 'A', lng: -100, arrivalUtc: '2026-12-24T20:00:00.000Z' }]));
    expect(outsideWindow.find((check) => check.name === 'Timezone and local arrival window')?.pass).toBe(false);

    const earlyArrival = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: -100 }, { id: 'b', name: 'B', lng: -99, transitSeconds: 900, arrivalUtc: '2026-12-24T23:30:00.000Z' },
    ]));
    expect(earlyArrival.find((check) => check.name === 'Travel chronology')?.pass).toBe(false);

    const tierMismatch = auditFixture(routeFixture([{ id: 'a', name: 'A', lng: -100, population: 400_000, tier: 'town', duration: 10 }]));
    expect(tierMismatch.find((check) => check.name === 'Stop tiers and duration')?.pass).toBe(false);
    const tierPass = auditFixture(routeFixture([{ id: 'a', name: 'A', lng: -100, population: 1_200_000, tier: 'major', duration: 60 }]));
    expect(tierPass.find((check) => check.name === 'Stop tiers and duration')?.pass).toBe(true);

    const fastLeg = auditFixture(routeFixture([
      { id: 'a', name: 'A', lng: -100 }, { id: 'b', name: 'B', lng: 0, arrivalUtc: '2026-12-24T23:21:00.000Z' },
    ]));
    expect(fastLeg.find((check) => check.name === 'Leg speed')?.pass).toBe(false);
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

  it('keeps the frozen old draft as an eastward and detour regression case', async () => {
    const { readFile } = await import('node:fs/promises');
    const document: unknown = JSON.parse(await readFile(new URL('./fixtures/route-2026-legacy.json', import.meta.url), 'utf8'));
    const nodes = (document as { route_nodes: { type: string; candidate_id: string; location: { name: string; country_code: string; timezone: string; timezone_offset: number; lat: number; lng: number }; comment?: string }[] }).route_nodes;
    const selected = nodes.filter((node) => node.type === 'DELIVERY').map((node) => ({
      id: node.candidate_id, name: node.location.name, country: node.location.country_code, timezone: node.location.timezone,
      utcOffsetMinutes: node.location.timezone_offset * 60, category: node.comment ?? 'populated', lat: node.location.lat, lng: node.location.lng,
    }));
    const result = auditRouteDocument(document, {
      config: { ...DEFAULT_GENERATOR_LIMITS, weights: { hub: 100 } },
      pool: selected, selected, zonesByCountry: {}, utcOffsetsByTimezone: {}, countryBoundsByCode: {},
      report: { continentBalance: {}, subregionBalance: {} }, vetoIds: [],
    });
    expect(result.checks.find((check) => check.name === 'Eastward legs')?.pass).toBe(false);
    expect(result.checks.find((check) => check.name === 'Detours')?.pass).toBe(false);
  });
});
