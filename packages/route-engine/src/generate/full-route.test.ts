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
  schedule?: { arrival_utc?: string | null; departure_utc?: string | null };
  stop_experience?: { stop_tier?: string; duration_seconds?: number };
  transit_to_here?: { distance_km?: number | null; speed_kmh?: number | null; duration_seconds?: number; eastward_reason?: string } | null;
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

type GeneratorInputs = Awaited<ReturnType<typeof loadGeneratorInputs>>;
type GeneratedDraft = ReturnType<typeof generateDraft>;

function expectDeliveriesAreTimed(deliveries: ReviewRouteNode[], routeNodes: ReviewRouteNode[], inputs: GeneratorInputs,
  expectedCount: number): void {
  expect(deliveries).toHaveLength(expectedCount);
  expect(new Set(deliveries.map((node) => node.candidate_id)).size).toBe(deliveries.length);
  deliveries.forEach((node, index) => expectDeliveryIsTimed(node, index, routeNodes, inputs));
}

function expectDeliveryIsTimed(node: ReviewRouteNode, index: number, routeNodes: ReviewRouteNode[], inputs: GeneratorInputs): void {
  const place = inputs.pool.find((candidate) => candidate.id === node.candidate_id);
  expect(place).toBeDefined();
  expectArrivalIsInWindow(node.schedule?.arrival_utc ?? '', place?.utcOffsetMinutes ?? 0);
  expectStopHasTierAndDwell(node);
  expectArrivalFollowsTravel(node, index, routeNodes);
}

function expectArrivalIsInWindow(iso: string, utcOffsetMinutes: number): void {
  expect(isInChristmasWindow({ iso, timezoneOrOffset: utcOffsetMinutes })).toBe(true);
}

function expectStopHasTierAndDwell(node: ReviewRouteNode): void {
  expect(node.stop_experience?.duration_seconds).toBeGreaterThan(0);
  expect(node.stop_experience?.stop_tier).toBeDefined();
}

function expectArrivalFollowsTravel(node: ReviewRouteNode, index: number, routeNodes: ReviewRouteNode[]): void {
  const priorDeparture = Date.parse(routeNodes[index]?.schedule?.departure_utc ?? '');
  const arrival = Date.parse(node.schedule?.arrival_utc ?? '');
  expect(arrival - priorDeparture).toBeGreaterThanOrEqual((node.transit_to_here?.duration_seconds ?? 0) * 1000);
}

function expectReportMeetsFlightLimits(generated: GeneratedDraft, inputs: GeneratorInputs): void {
  const report = generated.report;
  expect(report.p90LegSpeedKmh).toBeLessThanOrEqual(inputs.config.p90LegSpeedMaxKmh);
  expect(report.maxLegSpeedKmh).toBeLessThanOrEqual(inputs.config.maxLegSpeedKmh);
  expect(Date.parse(report.routeEndUtc)).toBeLessThanOrEqual(Date.parse('2026-12-25T14:00:00.000Z'));
  expect(report.eastwardLegs.every((leg) => ['dateline', 'offset-anomaly', 'return'].includes(leg.eastwardReason ?? ''))).toBe(true);
  expect(report.detours).toEqual([]);
  expect(Object.keys(report.localArrivalHistogram).length).toBeGreaterThanOrEqual(5);
  expect(report.localArrivalMin).toMatch(/^23:|^00:/);
  expect(report.localArrivalMax).toMatch(/^0[0-5]:/);
  expect(report.deliveryLegCount).toBe(report.count - 1);
  expect(report.shortDeliveryLegCount).toBeGreaterThan(400);
  expect(report.uncoveredCountryCodes.length).toBeGreaterThan(0);
  expect(Object.keys(report.offsetBalance).length).toBeGreaterThan(10);
}

function expectReviewIncludesReport(review: string, docs: string, deliveries: ReviewRouteNode[], generated: GeneratedDraft): void {
  const stopTable = /<table id="stops">.*?<tbody>(.*?)<\/tbody>/s.exec(review)?.[1] ?? '';
  expect([...stopTable.matchAll(/<tr>/g)]).toHaveLength(deliveries.length);
  expect(review).toContain('Every eastward leg and its reason');
  expect(review).toContain('Detour checks');
  expect(review).toContain('Local arrival histogram');
  expect(review).toContain('Stop tiers');
  expect(review).toContain('Candidate countries not reached');
  expect(review).toContain(generated.report.subnationalCoverageNote);
  expect(docs).toContain('fixed route total');
}

function expectAuditPasses(storedRoute: string, generated: GeneratedDraft, inputs: GeneratorInputs): void {
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
  const failures = audit.checks.filter((check) => !check.pass).map((check) => `${check.name}: ${check.detail}`);
  expect(audit.pass, failures.join('\n')).toBe(true);
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
    expect(generated.report.count).toBeGreaterThanOrEqual(500);
    expect(generated.report.candidateCount).toBeGreaterThan(generated.report.count);
    expect(generated.report.unselectedCandidateCount).toBe(generated.report.candidateCount - generated.report.count);
    const routeNodes = (JSON.parse(storedRoute) as { route_nodes: ReviewRouteNode[] }).route_nodes;
    const deliveries = routeNodes.filter((node) => node.type === 'DELIVERY');
    expectDeliveriesAreTimed(deliveries, routeNodes, inputs, generated.report.count);
    expectReportMeetsFlightLimits(generated, inputs);
    expectReviewIncludesReport(review, docs, deliveries, generated);
    expectAuditPasses(storedRoute, generated, inputs);
  }, 1_200_000);

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
