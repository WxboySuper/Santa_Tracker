import { applyCandidateOverrides, type RouteOverrides } from './overrides';
import type { Candidate, GeneratorConfig } from './types';

export type CandidateSelection = { candidates: Candidate[]; invalidCandidateIds: string[] };

function routeCategory(place: Candidate, config: GeneratorConfig): string {
  if (['cultural', 'nature', 'special'].includes(place.category)) return place.category;
  if (place.worldCity || (place.population ?? 0) >= 250_000) return 'hub';
  if (config.underservedCountries.includes(place.country)) return 'underserved';
  return 'populated';
}

function hasNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasCandidateIdentity(place: Candidate): boolean {
  return hasNonEmptyText(place.id)
    && hasNonEmptyText(place.name)
    && hasNonEmptyText(place.country)
    && hasNonEmptyText(place.timezone);
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

function isCandidateRecord(value: unknown): value is Candidate {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rowLabel(value: unknown, index: number): string {
  if (isCandidateRecord(value) && hasNonEmptyText(value.id)) return value.id;
  return `row-${index + 1}`;
}

function wikidataCandidate(place: Candidate): boolean {
  return /^Q\d+$/.test(place.id) || /wikidata\.org\/wiki\/Q\d+/.test(place.source ?? '');
}

/** Return the full eligible pool. The old route lock describes a reviewed selection, not this sweep. */
export function chooseCandidates(pool: Candidate[], config: GeneratorConfig, overrides: RouteOverrides = {}): CandidateSelection {
  const vetoed = new Set(overrides.veto ?? []);
  const records: { place: Candidate; rowLabel: string }[] = [];
  const invalidCandidateIds: string[] = [];
  for (const [index, place] of pool.entries()) {
    if (!isCandidateRecord(place)) {
      invalidCandidateIds.push(rowLabel(place, index));
      continue;
    }
    records.push({ place, rowLabel: rowLabel(place, index) });
  }
  const updated = applyCandidateOverrides(records.map(({ place }) => place), overrides);
  const seen = new Set<string>();
  const result: Candidate[] = [];
  for (const [index, place] of updated.entries()) {
    if (hasNonEmptyText(place.id) && vetoed.has(place.id)) continue;
    if (!validCandidate(place)) {
      invalidCandidateIds.push(records[index]?.rowLabel ?? `row-${index + 1}`);
      continue;
    }
    if (shouldSkipCandidate(place, vetoed, seen)) continue;
    seen.add(place.id);
    result.push(enrichCandidate(place, config));
  }
  if (result.length === 0) throw new Error('No eligible route candidates remain after vetoes and validation');
  return { candidates: result, invalidCandidateIds };
}

function shouldSkipCandidate(place: Candidate, vetoed: Set<string>, seen: Set<string>): boolean {
  if (vetoed.has(place.id)) return true;
  if (seen.has(place.id)) return true;
  return false;
}

function enrichCandidate(place: Candidate, config: GeneratorConfig): Candidate {
  const category = routeCategory(place, config);
  const isNationalCapital = place.isNationalCapital ?? place.isCapital ?? place.capital ?? (place.category === 'capital');
  const headlineLandmark = place.headlineLandmark ??
    (wikidataCandidate(place) && (category === 'special' || category === 'cultural'));
  return { ...place, utcOffsetMinutes: place.utcOffsetMinutes, category, isNationalCapital, headlineLandmark };
}
