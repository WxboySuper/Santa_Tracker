import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditRouteDocument } from './audit';
import { generateDraft, loadGeneratorInputs } from '../../../../tools/route-generator/generate-core';

type ReviewMetricsContext = {
  document: unknown;
  continentBalance: Record<string, number>;
  subregionBalance: Record<string, number>;
  countryNames: Record<string, string>;
};

type ReviewRouteNode = {
  type: string;
  candidate_id?: string;
  location?: { name?: string; country_code?: string };
  transit_to_here?: { distance_km?: number | null; speed_kmh?: number | null } | null;
};

function assertStoredStopRows(review: string, deliveryNodes: ReviewRouteNode[]): void {
  const stopTable = /<table id="stops">.*?<tbody>(.*?)<\/tbody>/s.exec(review)?.[1] ?? '';
  const rows = [...stopTable.matchAll(/<tr>(.*?)<\/tr>/gs)];
  expect(rows).toHaveLength(deliveryNodes.length);
  for (const [index, match] of rows.entries()) {
    const cells = [...(match[1] ?? '').matchAll(/<td>(.*?)<\/td>/g)].map((cell) => cell[1]);
    const transit = deliveryNodes[index]?.transit_to_here;
    expect(cells[8], `stored km for stop ${index + 1}`).toBe(String(transit?.distance_km ?? ''));
    expect(cells[9], `stored speed for stop ${index + 1}`).toBe(String(transit?.speed_kmh ?? ''));
  }
}

function assertNamedRoutePlaces(review: string, deliveryNodes: ReviewRouteNode[]): void {
  const marquesas = deliveryNodes.find((node) => node.candidate_id === 'Q172697');
  expect(marquesas?.location?.country_code).toBe('PF');
  const tromso = deliveryNodes.find((node) => node.candidate_id === 'Q26087');
  expect(tromso?.location?.name).toBe('Troms\u00F8');
  expect(review).toContain('Troms\u00F8');
}

function assertRegionalTotals(review: string, continentBalance: Record<string, number>, subregionBalance: Record<string, number>): void {
  for (const [name, count] of Object.entries(continentBalance)) {
    expect(review).toContain(`<tr><td>${name}</td><td>${count}</td></tr>`);
  }
  expect(review).toContain(`<tr><td>Pacific Islands</td><td>${subregionBalance['Pacific Islands']}</td></tr>`);
}

function storedSpeeds(routeNodes: ReviewRouteNode[]): number[] {
  return routeNodes.filter((node) => node.type !== 'START')
    .map((node) => node.transit_to_here?.speed_kmh).filter((speed): speed is number => speed !== undefined && speed !== null)
    .sort((left, right) => left - right);
}

function percentile(values: number[], fraction: number): number {
  return values[Math.ceil(values.length * fraction) - 1] ?? 0;
}

function assertStoredSpeedSummary(review: string, routeNodes: ReviewRouteNode[]): void {
  const speeds = storedSpeeds(routeNodes);
  const median = percentile(speeds, 0.5).toLocaleString('en-US');
  const p90 = percentile(speeds, 0.9).toLocaleString('en-US');
  const maximum = speeds.at(-1)?.toLocaleString('en-US');
  expect(review).toContain(`Stored leg speeds: median ${median} km/h, p90 ${p90} km/h, maximum ${maximum} km/h.`);
}

function assertDocumentedRouteMetrics(docs: string): void {
  expect(docs).toContain('Stored per-leg speeds have a median of 10,474 km/h, a p90 of 19,967 km/h, and a maximum of 20,000 km/h.');
  expect(docs).toContain('Africa 23, Asia 51, Europe 20, North America 21, Oceania 26, and South America 19.');
  expect(docs).toContain('The Pacific Islands subregion and the Pacific-island quota each count 19 stops.');
}

function assertCountryLabels(countryNames: Record<string, string>): void {
  expect(countryNames.GB).toBe('United Kingdom');
  expect(countryNames.KR).toBe('South Korea');
  expect(countryNames.MM).toBe('Myanmar');
  expect(countryNames.WS).toBe('Samoa');
  expect(countryNames.AS).toBe('American Samoa');
}

async function assertReviewMetricsMatchStoredRoute({ document, continentBalance, subregionBalance, countryNames }: ReviewMetricsContext): Promise<void> {
  const review = await readFile(resolve(process.cwd(), 'docs/planning/route-2026-draft/review.html'), 'utf8');
  const docs = await readFile(resolve(process.cwd(), 'docs/ROUTE_GENERATOR.md'), 'utf8');
  const routeNodes = (document as { route_nodes: ReviewRouteNode[] }).route_nodes;
  const deliveryNodes = routeNodes.filter((node) => node.type === 'DELIVERY');
  assertStoredStopRows(review, deliveryNodes);
  assertNamedRoutePlaces(review, deliveryNodes);
  assertRegionalTotals(review, continentBalance, subregionBalance);
  assertStoredSpeedSummary(review, routeNodes);
  assertDocumentedRouteMetrics(docs);
  assertCountryLabels(countryNames);
}

describe('committed 2026 route draft', () => {
  it('passes the mechanical route checks directly', async () => {
    const inputs = await loadGeneratorInputs({ seed: 2026, total: 160 });
    const generated = generateDraft(inputs);
    const text = await readFile(resolve(process.cwd(), 'docs/planning/route-2026-draft/route.json'), 'utf8');
    const document = JSON.parse(text) as unknown;
    const result = auditRouteDocument(document, {
      config: inputs.config,
      pool: inputs.pool,
      selected: generated.locations,
      zonesByCountry: inputs.tables.zonesByCountry,
      utcOffsetsByTimezone: inputs.tables.utcOffsetsByTimezone,
      countryBoundsByCode: inputs.tables.countryBoundsByCode,
      report: generated.report,
      vetoIds: [...inputs.overrides.veto ?? []],
    });
    const required = [
      'Legacy route schema', 'North Pole start and end', 'Candidate identity',
      'Required iconic and regional stops', 'Committed version and timestamp',
      'Stop count and category mix', 'Hub definition', 'Timezone and local Christmas arrivals',
      'Clean names and explicit region mappings',
      'UTC offset coverage', 'Regional quotas and Americas caps', 'Country totals and consecutive runs',
      'Vetoes, coordinates, duplicates, and separation', 'Island, opening, and ending rules',
      'Source links and stop experience', 'Flight window and North Pole return',
      'Arrival pacing and quiet gaps', 'Clock-hour coverage', 'Leg-speed targets',
      'Route length and eastward backtracking',
    ];
    for (const name of required) {
      const check = result.checks.find((entry) => entry.name === name);
      expect(check?.pass, `${name}: ${check?.detail ?? 'check missing'}`).toBe(true);
    }
    expect(result.checks.find((entry) => entry.name === 'Leg-speed targets')?.detail)
      .toContain('stored median 10,474 km/h, p90 19,967 km/h');

    await assertReviewMetricsMatchStoredRoute({
      document,
      continentBalance: generated.report.continentBalance,
      subregionBalance: generated.report.subregionBalance,
      countryNames: inputs.countryNames,
    });
  }, 120_000);
});
