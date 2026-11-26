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
type CandidateValidationState = Pick<CandidateValidationOptions, 'vetoed' | 'config' | 'options'> & {
  seenRows: Set<string>;
  acceptedIds: Set<string>;
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
  return Number.isInteger(place.utcOffsetMinutes)
    && place.utcOffsetMinutes! >= -720
    && place.utcOffsetMinutes! <= 840;
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

function candidateWithResolvedOffset(place: Candidate, options: CandidateSelectionOptions): Candidate | undefined {
  if (!hasCandidateIdentity(place)) return undefined;
  if (!hasValidCoordinates(place)) return undefined;
  if (Number.isInteger(place.utcOffsetMinutes)) return place;
  return options.recoverMissingUtcOffset?.(place);
}

type CandidateValidation =
  | { kind: 'vetoed'; duplicateId?: string }
  | { kind: 'invalid'; id: string; duplicateId?: string }
  | { kind: 'duplicate'; id: string }
  | { kind: 'accepted'; place: Candidate; duplicateId?: string };

function validateCandidateForSelection(place: Candidate, label: string, state: CandidateValidationState): CandidateValidation {
  const id = hasNonEmptyText(place.id) ? place.id : undefined;
  const duplicateRow = id !== undefined && state.seenRows.has(id);
  if (id !== undefined) state.seenRows.add(id);
  if (id !== undefined && state.acceptedIds.has(id)) return { kind: 'duplicate', id };
  const duplicateId = duplicateRow ? id : undefined;
  if (isVetoedCandidate(place, state.vetoed)) return { kind: 'vetoed', duplicateId };
  const resolved = candidateWithResolvedOffset(place, state.options);
  if (!resolved || !validCandidate(resolved)) return { kind: 'invalid', id: label, duplicateId };
  if (id !== undefined) state.acceptedIds.add(id);
  return { kind: 'accepted', place: enrichCandidate(resolved, state.config), duplicateId };
}

function recordInvalidCandidateId(id: string, invalidIds: string[], invalidSeen: Set<string>): void {
  if (invalidSeen.has(id)) return;
  invalidSeen.add(id);
  invalidIds.push(id);
}

function recordDuplicateCandidateId(id: string, duplicateIds: string[], duplicateSeen: Set<string>): void {
  if (duplicateSeen.has(id)) return;
  duplicateSeen.add(id);
  duplicateIds.push(id);
}

function validateAndEnrichCandidates({ updated, rowLabels, vetoed, config, options }: CandidateValidationOptions): CandidateSelection {
  const seenRows = new Set<string>();
  const acceptedIds = new Set<string>();
  const invalidSeen = new Set<string>();
  const duplicateSeen = new Set<string>();
  const candidates: Candidate[] = [];
  const invalidCandidateIds: string[] = [];
  const duplicateCandidateIds: string[] = [];
  const state: CandidateValidationState = { vetoed, seenRows, acceptedIds, config, options };
  for (const [index, place] of updated.entries()) {
    const result = validateCandidateForSelection(place, rowLabels[index] ?? `row-${index + 1}`, state);
    const duplicateId = result.kind === 'duplicate' ? result.id : result.duplicateId;
    if (duplicateId) recordDuplicateCandidateId(duplicateId, duplicateCandidateIds, duplicateSeen);
    if (result.kind === 'vetoed') continue;
    if (result.kind === 'invalid') recordInvalidCandidateId(result.id, invalidCandidateIds, invalidSeen);
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
