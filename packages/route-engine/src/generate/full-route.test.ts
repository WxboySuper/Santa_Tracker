import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { auditRouteDocument } from './audit';
import { loadGeneratorInputs } from '../../../../tools/route-generator/generate-core';
import type { Candidate } from './types';

type LegacyNode = {
  type: string;
  candidate_id?: string;
  comment?: string;
  notes?: string | null;
  location?: { name?: string; country_code?: string; timezone?: string; timezone_offset?: number; lat?: number; lng?: number };
};

function candidateFromLegacyNode(node: LegacyNode): Candidate[] {
    if (node.type !== 'DELIVERY') return [];
    if (!node.candidate_id) return [];
    const place = node.location;
    if (!place) return [];
    if (!place.country_code) return [];
    if (!place.timezone) return [];
    if (place.lat === undefined) return [];
    if (place.lng === undefined) return [];
    return [{
      id: node.candidate_id,
      name: place.name ?? node.candidate_id,
      country: place.country_code,
      timezone: place.timezone,
      utcOffsetMinutes: (place.timezone_offset ?? 0) * 60,
      category: node.comment ?? 'populated',
      source: node.notes ?? undefined,
      lat: place.lat,
      lng: place.lng,
    }];
}

function candidatesFromLegacyNodes(nodes: LegacyNode[]): Candidate[] {
  return nodes.flatMap(candidateFromLegacyNode);
}

describe('superseded 2026 route draft', () => {
  it('is rejected for eastward legs and geographic detours', async () => {
    const inputs = await loadGeneratorInputs({ seed: 2026 });
    const fixture = new URL('./fixtures/route-2026-legacy.json', import.meta.url);
    const document = JSON.parse(await readFile(fixture, 'utf8')) as { route_nodes: LegacyNode[] };
    const result = auditRouteDocument(document, {
      config: inputs.config,
      pool: inputs.pool,
      selected: candidatesFromLegacyNodes(document.route_nodes),
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
