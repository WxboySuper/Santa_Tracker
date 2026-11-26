import { applyCandidateOverrides, type RouteOverrides } from './overrides';
import { assertNoLegacySelectionOverrides } from './selection-overrides';
import type { Candidate, GeneratorConfig } from './types';

export type CandidateSelection = { candidates: Candidate[]; invalidCandidateIds: string[]; duplicateCandidateIds: string[] };
export type CandidateSelectionOptions = { recoverMissingUtcOffset?: (place: Candidate) => Candidate | undefined };
type CandidateRows = { candidates: Candidate[]; rowLabels: string[]; invalidCandidateIds: string[] };
type CandidateValidationOptions = {
  updated: Candidate[];
  rowLabels: string[];
  vetoed: Set<string>;
  config: GeneratorConfig;
  options: CandidateSelectionOptions;
};

function routeCategory(place: Candidate, config: GeneratorConfig): string {
  if (place.category === 'capital') return 'capital';
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

function collectCandidateRows(pool: Candidate[]): CandidateRows {
  const candidates: Candidate[] = [];
  const rowLabels: string[] = [];
  const invalidCandidateIds: string[] = [];
  for (const [index, place] of pool.entries()) {
    if (!isCandidateRecord(place)) {
      invalidCandidateIds.push(rowLabel(place, index));
      continue;
    }
    candidates.push(place);
    rowLabels.push(rowLabel(place, index));
  }
  return { candidates, rowLabels, invalidCandidateIds };
}

function wikidataCandidate(place: Candidate): boolean {
  return /^Q\d+$/.test(place.id) || /wikidata\.org\/wiki\/Q\d+/.test(place.source ?? '');
}

function isVetoedCandidate(place: Candidate, vetoed: Set<string>): boolean {
  return hasNonEmptyText(place.id) && vetoed.has(place.id);
}

type CandidateValidation =
  | { kind: 'vetoed' }
  | { kind: 'invalid'; id: string }
  | { kind: 'duplicate'; id: string }
  | { kind: 'accepted'; place: Candidate };

function validateCandidateForSelection(place: Candidate, label: string, vetoed: Set<string>, seen: Set<string>,
  config: GeneratorConfig, options: CandidateSelectionOptions): CandidateValidation {
  if (isVetoedCandidate(place, vetoed)) return { kind: 'vetoed' };
  if (!hasCandidateIdentity(place) || !hasValidCoordinates(place)) return { kind: 'invalid', id: label };
  const resolved = Number.isInteger(place.utcOffsetMinutes) ? place : options.recoverMissingUtcOffset?.(place);
  if (!resolved || !validCandidate(resolved)) return { kind: 'invalid', id: label };
  if (seen.has(resolved.id)) return { kind: 'duplicate', id: resolved.id };
  seen.add(resolved.id);
  return { kind: 'accepted', place: enrichCandidate(resolved, config) };
}

function validateAndEnrichCandidates({ updated, rowLabels, vetoed, config, options }: CandidateValidationOptions): CandidateSelection {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const invalidCandidateIds: string[] = [];
  const duplicateCandidateIds: string[] = [];
  for (const [index, place] of updated.entries()) {
    const result = validateCandidateForSelection(place, rowLabels[index] ?? `row-${index + 1}`,
      vetoed, seen, config, options);
    if (result.kind === 'vetoed') continue;
    if (result.kind === 'invalid') invalidCandidateIds.push(result.id);
    if (result.kind === 'duplicate') {
      invalidCandidateIds.push(result.id);
      duplicateCandidateIds.push(result.id);
    }
    if (result.kind === 'accepted') candidates.push(result.place);
  }
  return { candidates, invalidCandidateIds, duplicateCandidateIds };
}

/** Return the full eligible pool. The old route lock describes a reviewed selection, not this sweep. */
export function chooseCandidates(pool: Candidate[], config: GeneratorConfig, overrides: RouteOverrides = {},
  options: CandidateSelectionOptions = {}): CandidateSelection {
  assertNoLegacySelectionOverrides(overrides);
  const vetoed = new Set(overrides.veto ?? []);
  const rows = collectCandidateRows(pool);
  const updated = applyCandidateOverrides(rows.candidates, overrides);
  const selection = validateAndEnrichCandidates({ updated, rowLabels: rows.rowLabels, vetoed, config, options });
  const invalidCandidateIds = [...rows.invalidCandidateIds, ...selection.invalidCandidateIds];
  if (selection.candidates.length === 0) throw new Error('No eligible route candidates remain after vetoes and validation');
  return { ...selection, invalidCandidateIds };
}

function enrichCandidate(place: Candidate, config: GeneratorConfig): Candidate {
  const category = routeCategory(place, config);
  const isNationalCapital = place.isNationalCapital === true || place.isCapital === true
    || place.capital === true || place.category === 'capital';
  const headlineLandmark = place.headlineLandmark ??
    (wikidataCandidate(place) && (category === 'special' || category === 'cultural'));
  return { ...place, utcOffsetMinutes: place.utcOffsetMinutes, category, isNationalCapital, headlineLandmark };
}
