import { applyCandidateOverrides, type RouteOverrides } from './overrides';
import type { Candidate, GeneratorConfig } from './types';

function routeCategory(place: Candidate, config: GeneratorConfig): string {
  if (['cultural', 'nature', 'special'].includes(place.category)) return place.category;
  if (place.worldCity || (place.population ?? 0) >= 250_000) return 'hub';
  if (config.underservedCountries.includes(place.country)) return 'underserved';
  return 'populated';
}

function validCandidate(place: Candidate): boolean {
  return Boolean(place.id && place.name.trim() && place.country && place.timezone)
    && Number.isFinite(place.lat) && Number.isFinite(place.lng)
    && place.lat >= -90 && place.lat <= 90 && place.lng >= -180 && place.lng <= 180;
}

function wikidataCandidate(place: Candidate): boolean {
  return /^Q\d+$/.test(place.id) || /wikidata\.org\/wiki\/Q\d+/.test(place.source ?? '');
}

/** Return the full eligible pool. The old route lock describes a reviewed selection, not this sweep. */
export function chooseCandidates(pool: Candidate[], config: GeneratorConfig, overrides: RouteOverrides = {}): Candidate[] {
  const vetoed = new Set(overrides.veto ?? []);
  const updated = applyCandidateOverrides(pool, overrides);
  const seen = new Set<string>();
  const result: Candidate[] = [];
  for (const place of updated) {
    if (vetoed.has(place.id) || seen.has(place.id) || !validCandidate(place)) continue;
    seen.add(place.id);
    const category = routeCategory(place, config);
    result.push({
      ...place,
      utcOffsetMinutes: place.utcOffsetMinutes ?? 0,
      category,
      isNationalCapital: place.isNationalCapital ?? place.isCapital ?? place.capital ?? (place.category === 'capital'),
      headlineLandmark: place.headlineLandmark ?? (wikidataCandidate(place) && (category === 'special' || category === 'cultural')),
    });
  }
  if (result.length === 0) throw new Error('No eligible route candidates remain after vetoes and validation');
  return result;
}
