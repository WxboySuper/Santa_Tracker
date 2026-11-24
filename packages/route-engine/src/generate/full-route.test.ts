import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditRouteDocument } from './audit';
import { generateDraft, loadGeneratorInputs } from '../../../../tools/route-generator/generate-core';

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
      vetoIds: [...inputs.overrides.veto ?? []],
    });
    const required = [
      'Legacy route schema', 'North Pole start and end', 'Candidate identity',
      'Required iconic and regional stops', 'Committed version and timestamp',
      'Stop count and category mix', 'Hub definition', 'Timezone and local Christmas arrivals',
      'UTC offset coverage', 'Regional quotas and Americas caps', 'Country totals and consecutive runs',
      'Vetoes, duplicates, and separation', 'Island, opening, and ending rules',
      'Source links and stop experience', 'Flight window and North Pole return',
      'Arrival pacing and quiet gaps', 'Clock-hour coverage', 'Leg-speed targets',
      'Route length and eastward backtracking',
    ];
    for (const name of required) {
      const check = result.checks.find((entry) => entry.name === name);
      expect(check?.pass, `${name}: ${check?.detail ?? 'check missing'}`).toBe(true);
    }
  }, 120_000);
});
