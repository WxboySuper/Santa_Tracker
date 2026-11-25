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

  it('maps every country code in the candidate snapshots', async () => {
    type SnapshotPlace = { id: string; name: string; country: string; lat: number; lng: number; timezone: string; category?: string };
    const [placesText, curatedText] = await Promise.all([
      readFile(new URL('../../../../tools/route-generator/data/places.json', import.meta.url), 'utf8'),
      readFile(new URL('../../../../tools/route-generator/data/curated.json', import.meta.url), 'utf8'),
    ]);
    const places = [...JSON.parse(placesText) as SnapshotPlace[], ...JSON.parse(curatedText) as SnapshotPlace[]];
    const examples = new Map<string, SnapshotPlace>();
    places.forEach((place) => examples.set(place.country, place));

    const unmapped: string[] = [];
    for (const [country, place] of examples) {
      try {
        classifyRegion({ ...place, category: place.category ?? 'populated' });
      } catch (error) {
        unmapped.push(`${country}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(unmapped).toEqual([]);
  });
});
