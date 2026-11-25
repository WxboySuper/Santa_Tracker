import { applyCandidateOverrides, type RouteOverrides } from './overrides';
import type { Candidate, GeneratorConfig } from './types';

function routeCategory(place: Candidate, config: GeneratorConfig): string {
  if (['cultural', 'nature', 'special'].includes(place.category)) return place.category;
  if (place.worldCity || (place.population ?? 0) >= 250_000) return 'hub';
  if (config.underservedCountries.includes(place.country)) return 'underserved';
  return 'populated';
}

function hasCandidateIdentity(place: Candidate): boolean {
  if (typeof place.id !== 'string' || !place.id) return false;
  if (typeof place.name !== 'string' || !place.name.trim()) return false;
  if (typeof place.country !== 'string' || !place.country) return false;
  return typeof place.timezone === 'string' && Boolean(place.timezone);
}

function hasValidCoordinates(place: Candidate): boolean {
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return false;
  if (place.lat < -90 || place.lat > 90) return false;
  return place.lng >= -180 && place.lng <= 180;
}

function validCandidate(place: Candidate): boolean {
  if (!hasCandidateIdentity(place)) return false;
  if (!hasValidCoordinates(place)) return false;
  return Number.isInteger(place.utcOffsetMinutes);
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
    if (shouldSkipCandidate(place, vetoed, seen)) continue;
    seen.add(place.id);
    result.push(enrichCandidate(place, config));
  }
  if (result.length === 0) throw new Error('No eligible route candidates remain after vetoes and validation');
  return result;
}

function shouldSkipCandidate(place: Candidate, vetoed: Set<string>, seen: Set<string>): boolean {
  if (vetoed.has(place.id)) return true;
  if (seen.has(place.id)) return true;
  return !validCandidate(place);
}

function enrichCandidate(place: Candidate, config: GeneratorConfig): Candidate {
  const category = routeCategory(place, config);
  const isNationalCapital = place.isNationalCapital ?? place.isCapital ?? place.capital ?? (place.category === 'capital');
  const headlineLandmark = place.headlineLandmark ??
    (wikidataCandidate(place) && (category === 'special' || category === 'cultural'));
  return { ...place, utcOffsetMinutes: place.utcOffsetMinutes, category, isNationalCapital, headlineLandmark };
}
