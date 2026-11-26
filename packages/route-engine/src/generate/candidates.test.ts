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
    expect(result.candidates.map((place) => place.id)).toEqual(['city-a', 'town-b', 'landmark-c']);
    expect(result.candidates.map((place) => place.category)).toEqual(['hub', 'underserved', 'cultural']);
    expect(result.invalidCandidateIds).toEqual([]);
  });

  it('applies a candidate veto', () => {
    const result = chooseCandidates(pool, DEFAULT_GENERATOR_LIMITS, { veto: ['city-a'] });
    expect(result.candidates.map((place) => place.id)).toEqual(['town-b', 'landmark-c']);
  });

  it('rejects stale selection locks and swaps instead of ignoring them', () => {
    expect(() => chooseCandidates(pool, DEFAULT_GENERATOR_LIMITS, { lock: ['city-a'] })).toThrow(/Lock and swap/);
    expect(() => chooseCandidates(pool, DEFAULT_GENERATOR_LIMITS, { swap: { 'city-a': 'town-b' } })).toThrow(/Lock and swap/);
  });

  it('applies owner rename and timezone overrides to candidates', () => {
    const result = chooseCandidates(pool, DEFAULT_GENERATOR_LIMITS, { rename: { 'city-a': 'Renamed City' }, timezone: { 'city-a': 'Etc/UTC' } });
    expect(result.candidates[0]?.name).toBe('Renamed City');
    expect(result.candidates[0]?.timezone).toBe('Etc/UTC');
  });

  it('combines capital aliases with OR semantics', () => {
    const capital: Candidate = { ...pool[1]!, isNationalCapital: false, isCapital: true };
    const result = chooseCandidates([capital], DEFAULT_GENERATOR_LIMITS);
    expect(result.candidates[0]?.isNationalCapital).toBe(true);
  });

  it('preserves capital category for reporting and hub-equivalent ranking', () => {
    const capital: Candidate = { ...pool[0]!, id: 'capital-a', category: 'capital', population: 300_000 };
    const result = chooseCandidates([capital], DEFAULT_GENERATOR_LIMITS);
    expect(result.candidates[0]?.category).toBe('capital');
    expect(result.candidates[0]?.isNationalCapital).toBe(true);
  });

  it('rejects missing UTC offsets unless the generator supplies a recovery resolver', () => {
    const { utcOffsetMinutes: _offset, ...missingOffset } = pool[0]!;
    const invalid = { ...missingOffset, id: 'missing-offset' };
    const result = chooseCandidates([pool[0]!, invalid], DEFAULT_GENERATOR_LIMITS);
    expect(result.candidates.map((place) => place.id)).toEqual(['city-a']);
    expect(result.invalidCandidateIds).toEqual(['missing-offset']);
  });

  it('reports malformed names instead of throwing on a data row', () => {
    const malformed = { ...pool[0], id: 'missing-name', name: null } as unknown as Candidate;
    const result = chooseCandidates([pool[0]!, malformed], DEFAULT_GENERATOR_LIMITS);
    expect(result.candidates.map((place) => place.id)).toEqual(['city-a']);
    expect(result.invalidCandidateIds).toEqual(['missing-name']);
  });

  it('reports non-object pool rows without aborting valid candidate selection', () => {
    const result = chooseCandidates([pool[0]!, null as unknown as Candidate], DEFAULT_GENERATOR_LIMITS);
    expect(result.candidates.map((place) => place.id)).toEqual(['city-a']);
    expect(result.invalidCandidateIds).toEqual(['row-2']);
  });

  it('reports duplicate candidate identities instead of silently shrinking the pool', () => {
    const duplicate = { ...pool[0]!, name: 'Duplicate city row' };
    const result = chooseCandidates([pool[0]!, duplicate], DEFAULT_GENERATOR_LIMITS);
    expect(result.candidates.map((place) => place.id)).toEqual(['city-a']);
    expect(result.invalidCandidateIds).toEqual(['city-a']);
    expect(result.duplicateCandidateIds).toEqual(['city-a']);
  });
});
