import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditRouteDocument } from './audit';
import { generateDraft, loadGeneratorInputs } from '../../../../tools/route-generator/generate-core';

type ReviewMetricsContext = {
  document: unknown;
  continentBalance: Record<string, number>;
  countryNames: Record<string, string>;
};

async function assertReviewMetricsMatchStoredRoute({ document, continentBalance, countryNames }: ReviewMetricsContext): Promise<void> {
  const review = await readFile(resolve(process.cwd(), 'docs/planning/route-2026-draft/review.html'), 'utf8');
  const stopTable = /<table id="stops">.*?<tbody>(.*?)<\/tbody>/s.exec(review)?.[1] ?? '';
  const rows = [...stopTable.matchAll(/<tr>(.*?)<\/tr>/gs)];
  const routeNodes = (document as { route_nodes: {
    type: string;
    candidate_id?: string;
    location?: { country_code?: string };
    transit_to_here?: { distance_km?: number | null; speed_kmh?: number | null } | null;
  }[] }).route_nodes;
  const deliveryNodes = routeNodes.filter((node) => node.type === 'DELIVERY');
  expect(rows).toHaveLength(deliveryNodes.length);
  for (const [index, match] of rows.entries()) {
    const cells = [...(match[1] ?? '').matchAll(/<td>(.*?)<\/td>/g)].map((cell) => cell[1]);
    const transit = deliveryNodes[index]?.transit_to_here;
    expect(cells[8], `stored km for stop ${index + 1}`).toBe(String(transit?.distance_km ?? ''));
    expect(cells[9], `stored speed for stop ${index + 1}`).toBe(String(transit?.speed_kmh ?? ''));
  }

  const marquesas = deliveryNodes.find((node) => node.candidate_id === 'Q172697');
  expect(marquesas?.location?.country_code).toBe('PF');
  expect(review).toContain(`<tr><td>Oceania</td><td>${continentBalance.Oceania}</td></tr>`);
  expect(countryNames.GB).toBe('United Kingdom');
  expect(countryNames.KR).toBe('South Korea');
  expect(countryNames.MM).toBe('Myanmar');
  expect(countryNames.WS).toBe('Samoa');
  expect(countryNames.AS).toBe('American Samoa');
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

    await assertReviewMetricsMatchStoredRoute({
      document,
      continentBalance: generated.report.continentBalance,
      countryNames: inputs.countryNames,
    });
  }, 120_000);
});
