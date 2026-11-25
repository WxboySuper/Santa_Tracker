import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { auditRouteDocument } from './audit';
import { generateDraft, loadGeneratorInputs, serializeDraft } from '../../../../tools/route-generator/generate-core';
import { isInChristmasWindow } from './sweep';
import type { Candidate } from './types';

type ReviewRouteNode = {
  id: string;
  type: string;
  candidate_id?: string;
  comment?: string;
  notes?: string | null;
  location?: { name?: string; country_code?: string; timezone?: string; timezone_offset?: number; lat?: number; lng?: number };
  schedule?: { arrival_utc?: string | null };
  stop_experience?: { stop_tier?: string; duration_seconds?: number };
  transit_to_here?: { distance_km?: number | null; speed_kmh?: number | null; eastward_reason?: string } | null;
};

type LegacyLocation = { name: string; country_code: string; timezone: string; timezone_offset?: number; lat: number; lng: number };

function hasLegacyDeliveryIdentity(node: ReviewRouteNode): node is ReviewRouteNode & { candidate_id: string } {
  return node.type === 'DELIVERY' && Boolean(node.candidate_id);
}

function hasLegacyLocation(location: ReviewRouteNode['location']): location is LegacyLocation {
  return Boolean(location?.name && location.country_code && location.timezone)
    && location?.lat !== undefined && location?.lng !== undefined;
}

function legacyCandidate(node: ReviewRouteNode): Candidate | undefined {
  const location = node.location;
  if (!hasLegacyDeliveryIdentity(node) || !hasLegacyLocation(location)) return undefined;
  return {
    id: node.candidate_id,
    name: location.name,
    country: location.country_code,
    timezone: location.timezone,
    utcOffsetMinutes: (location.timezone_offset ?? 0) * 60,
    category: node.comment ?? 'populated',
    source: node.notes ?? undefined,
    lat: location.lat,
    lng: location.lng,
  };
}

function legacySelected(nodes: ReviewRouteNode[]): Candidate[] {
  return nodes.flatMap((node) => {
    const place = legacyCandidate(node);
    return place ? [place] : [];
  });
}

describe('committed 2026 route draft', () => {
  it('matches seeded generation, the local window, tier dwell and review report', async () => {
    const inputs = await loadGeneratorInputs({ seed: 2026 });
    const generated = generateDraft(inputs);
    const routePath = new URL('../../../../docs/planning/route-2026-draft/route.json', import.meta.url);
    const reviewPath = new URL('../../../../docs/planning/route-2026-draft/review.html', import.meta.url);
    const docsPath = new URL('../../../../docs/ROUTE_GENERATOR.md', import.meta.url);
    const [storedRoute, review, docs] = await Promise.all([
      readFile(routePath, 'utf8'), readFile(reviewPath, 'utf8'), readFile(docsPath, 'utf8'),
    ]);
    expect(storedRoute).toBe(serializeDraft(generated));

    const routeNodes = (JSON.parse(storedRoute) as { route_nodes: ReviewRouteNode[] }).route_nodes;
    const deliveries = routeNodes.filter((node) => node.type === 'DELIVERY');
    expect(deliveries).toHaveLength(generated.report.count);
    expect(new Set(deliveries.map((node) => node.candidate_id)).size).toBe(deliveries.length);
    deliveries.forEach((node) => {
      const place = inputs.pool.find((candidate) => candidate.id === node.candidate_id);
      expect(place).toBeDefined();
      expect(isInChristmasWindow(node.schedule?.arrival_utc ?? '', place?.utcOffsetMinutes ?? 0)).toBe(true);
      expect(node.stop_experience?.duration_seconds).toBeGreaterThan(0);
      expect(node.stop_experience?.stop_tier).toBeDefined();
    });

    expect(generated.report.p90LegSpeedKmh).toBeLessThanOrEqual(inputs.config.p90LegSpeedMaxKmh);
    expect(generated.report.maxLegSpeedKmh).toBeLessThanOrEqual(inputs.config.maxLegSpeedKmh);
    expect(Date.parse(generated.report.routeEndUtc)).toBeLessThanOrEqual(Date.parse('2026-12-25T14:00:00.000Z'));
    expect(generated.report.eastwardLegs.every((leg) => ['dateline', 'offset-anomaly', 'return'].includes(leg.eastwardReason ?? ''))).toBe(true);
    expect(generated.report.detours).toEqual([]);

    const stopTable = /<table id="stops">.*?<tbody>(.*?)<\/tbody>/s.exec(review)?.[1] ?? '';
    expect([...stopTable.matchAll(/<tr>/g)]).toHaveLength(deliveries.length);
    expect(review).toContain('Every eastward leg and its reason');
    expect(review).toContain('Detour checks');
    expect(review).toContain('Local arrival histogram');
    expect(review).toContain('Stop tiers');
    expect(docs).toContain('fixed route total');

    const audit = auditRouteDocument(JSON.parse(storedRoute) as unknown, {
      config: inputs.config,
      pool: inputs.pool,
      selected: generated.locations,
      zonesByCountry: inputs.tables.zonesByCountry,
      utcOffsetsByTimezone: inputs.tables.utcOffsetsByTimezone,
      countryBoundsByCode: inputs.tables.countryBoundsByCode,
      report: generated.report,
      vetoIds: inputs.overrides.veto ?? [],
    });
    expect(audit.pass, audit.checks.filter((check) => !check.pass).map((check) => `${check.name}: ${check.detail}`).join('\n')).toBe(true);
  }, 120_000);

  it('rejects the frozen pre-sweep route with the updated audit', async () => {
    const inputs = await loadGeneratorInputs({ seed: 2026 });
    const legacyPath = new URL('./fixtures/route-2026-legacy.json', import.meta.url);
    const document = JSON.parse(await readFile(legacyPath, 'utf8')) as { route_nodes: ReviewRouteNode[] };
    const selected = legacySelected(document.route_nodes);
    const result = auditRouteDocument(document, {
      config: inputs.config,
      pool: inputs.pool,
      selected,
      zonesByCountry: inputs.tables.zonesByCountry,
      utcOffsetsByTimezone: inputs.tables.utcOffsetsByTimezone,
      countryBoundsByCode: inputs.tables.countryBoundsByCode,
      report: { continentBalance: {}, subregionBalance: {} },
      vetoIds: inputs.overrides.veto ?? [],
      worldPlaces: inputs.pool,
    });

    expect(result.pass).toBe(false);
    expect(result.checks.find((check) => check.name === 'Eastward legs')?.pass).toBe(false);
    expect(result.checks.find((check) => check.name === 'Detours')?.pass).toBe(false);
  }, 120_000);
});
