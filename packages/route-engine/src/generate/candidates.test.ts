import { describe, expect, it } from 'vitest';
import { chooseCandidates } from './candidates';
import { DEFAULT_GENERATOR_LIMITS, type Candidate } from './types';

const pool: Candidate[] = [
  { id: 'city-a', name: 'City A', country: 'AA', lat: 1, lng: 1, timezone: 'UTC', utcOffsetMinutes: 0, category: 'populated', population: 300_000 },
  { id: 'town-b', name: 'Town B', country: 'BB', lat: 2, lng: 2, timezone: 'UTC', utcOffsetMinutes: 0, category: 'populated', population: 20_000 },
  { id: 'landmark-c', name: 'Landmark C', country: 'CC', lat: 3, lng: 3, timezone: 'UTC', utcOffsetMinutes: 0, category: 'cultural', source: 'https://www.wikidata.org/wiki/Q3' },
];

describe('chooseCandidates', () => {
  it('keeps the full pool and classifies populated places for tie-breaking', () => {
    const result = chooseCandidates(pool, { ...DEFAULT_GENERATOR_LIMITS, underservedCountries: ['BB'] });
    expect(result.map((place) => place.id)).toEqual(['city-a', 'town-b', 'landmark-c']);
    expect(result.map((place) => place.category)).toEqual(['hub', 'underserved', 'cultural']);
  });

  it('applies the sensitive-place veto without restoring an old route lock', () => {
    const result = chooseCandidates(pool, DEFAULT_GENERATOR_LIMITS, { lock: ['city-a'], veto: ['city-a'] });
    expect(result.map((place) => place.id)).toEqual(['town-b', 'landmark-c']);
  });

  it('applies owner rename and timezone overrides to candidates', () => {
    const result = chooseCandidates(pool, DEFAULT_GENERATOR_LIMITS, { rename: { 'city-a': 'Renamed City' }, timezone: { 'city-a': 'Etc/UTC' } });
    expect(result[0]?.name).toBe('Renamed City');
    expect(result[0]?.timezone).toBe('Etc/UTC');
  });
});
