import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { auditRouteDocument } from './audit';
import { generateDraft, loadGeneratorInputs } from '../../../../tools/route-generator/generate-core';

describe('superseded 2026 route draft', () => {
  it('is rejected for eastward legs and geographic detours', async () => {
    const inputs = await loadGeneratorInputs({ seed: 2026 });
    const generated = generateDraft(inputs);
    const text = await readFile(new URL('../../../../docs/planning/route-2026-draft/route.json', import.meta.url), 'utf8');
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
