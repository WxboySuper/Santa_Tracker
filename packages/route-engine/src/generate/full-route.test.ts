import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { auditRouteDocument } from './audit';
import { loadGeneratorInputs } from '../../../../tools/route-generator/generate-core';

describe('superseded 2026 route draft', () => {
  it('is rejected for eastward legs and geographic detours', async () => {
    const inputs = await loadGeneratorInputs({ seed: 2026 });
    const text = await readFile(new URL('../../../../docs/planning/route-2026-draft/route.json', import.meta.url), 'utf8');
    const document = JSON.parse(text) as unknown;
    const routeNodes = (document as { route_nodes?: { type?: string; candidate_id?: unknown }[] }).route_nodes ?? [];
    const candidateIds = new Set(routeNodes
      .filter((node) => node.type === 'DELIVERY')
      .map((node) => node.candidate_id)
      .filter((candidateId): candidateId is string => typeof candidateId === 'string'));
    const selected = inputs.pool.filter((place) => candidateIds.has(place.id));
    const result = auditRouteDocument(document, {
      config: inputs.config,
      pool: inputs.pool,
      selected,
      zonesByCountry: inputs.tables.zonesByCountry,
      utcOffsetsByTimezone: inputs.tables.utcOffsetsByTimezone,
      countryBoundsByCode: inputs.tables.countryBoundsByCode,
      report: { continentBalance: {}, subregionBalance: {} },
      vetoIds: [...inputs.overrides.veto ?? []],
      worldPlaces: inputs.pool,
    });

    const eastward = result.checks.find((entry) => entry.name === 'Eastward legs');
    const detours = result.checks.find((entry) => entry.name === 'Detours');
    expect(eastward?.pass, eastward?.detail).toBe(false);
    expect(eastward?.detail).toContain('Helsinki -> Istanbul');
    expect(detours?.pass, detours?.detail).toBe(false);
    expect(result.reports.find((report) => report.name === 'Path length')?.detail).toContain('243,959 km');
  }, 120_000);
});
