import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { classifyRegion } from './regions';
import type { Candidate } from './types';

function candidate(country: string, name = country, lat = 0, lng = 0): Candidate {
  return { id: `${country}-test`, name, country, timezone: 'Etc/UTC', lat, lng, category: 'special' };
}

describe('classifyRegion', () => {
  it('maps Samoa to Oceania and the Pacific Islands', () => {
    expect(classifyRegion(candidate('WS', 'Apia', -13.83571, -171.7686))).toMatchObject({
      continent: 'Oceania',
      subregion: 'Pacific Islands',
      pacificIsland: true,
    });
  });

  it('throws for an unknown country instead of treating it as Europe', () => {
    expect(() => classifyRegion(candidate('ZZ', 'Unknown place'))).toThrow('No explicit continent mapping');
  });

  it('maps every country code in the committed route', async () => {
    const text = await readFile(new URL('../../../../docs/planning/route-2026-draft/route.json', import.meta.url), 'utf8');
    const document = JSON.parse(text) as {
      route_nodes: { id: string; type: string; location: { name: string; country_code?: string | null; lat: number; lng: number } }[];
    };
    const countryCodes = new Set(document.route_nodes.map((node) => node.location.country_code).filter((code): code is string => Boolean(code)));
    expect(countryCodes.size).toBeGreaterThan(0);
    for (const country of countryCodes) {
      const routeNode = document.route_nodes.find((node) => node.location.country_code === country);
      expect(() => classifyRegion(candidate(country, routeNode?.location.name, routeNode?.location.lat, routeNode?.location.lng))).not.toThrow();
    }
  });
});
