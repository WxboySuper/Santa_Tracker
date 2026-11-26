import { haversineKm } from '../geo';
import { NORTH_POLE } from './types';
import { eastwardCount } from './order-path';
import { stopDurationSeconds, stopTier } from './sweep';
import { admin1UnitFor } from './admin1';
import { compareStableIds } from './selection';
import type { Candidate, GeneratorConfig } from './types';
import { categoryPreference, countryCapacity, hardDetourCount, MAX_ROUTE_STOPS, planTiming, requiredSnapshotOffset, canStartFromNorthPole, REQUIRED_ADMIN1_CODES, seededRandom, SeparationIndex, type RoutePlan, type TimedCandidate } from './order';

function insertionPositions(order: Candidate[], place: Candidate): { index: number; addedDistance: number }[] {
  const positions: { index: number; addedDistance: number }[] = [];
  for (let index = 1; index <= order.length; index++) {
    const from = index === 0 ? NORTH_POLE : order[index - 1];
    const to = index === order.length ? NORTH_POLE : order[index];
    if (!from || !to) continue;
    const removed = haversineKm(from, to);
    const added = haversineKm(from, place) + haversineKm(place, to) - removed;
    positions.push({ index, addedDistance: added });
  }
  return positions.sort((left, right) => left.addedDistance - right.addedDistance || left.index - right.index);
}

type RankedInsertion = { place: Candidate; positions: { index: number; addedDistance: number }[]; dwellSeconds: number };
type InsertionState = {
  route: TimedCandidate[];
  counts: Map<string, number>;
  admin1Counts: Map<string, number>;
  bandCounts: Map<number, number>;
  separation: SeparationIndex;
};
export type InsertionPass = {
  config: GeneratorConfig;
  bandSpreadMinutes: number;
  coverageOnly: boolean;
  maxPositionAttempts: number;
  maxStops?: number;
  maxStopsByBand?: Map<number, number>;
};

function rankInsertions(initial: TimedCandidate[], pool: Candidate[], config: GeneratorConfig): RankedInsertion[] {
  const initiallyCovered = new Set(initial.map((place) => place.country));
  const random = seededRandom(config.seed ^ 0x27d4eb2d);
  const tieBreaks = new Map<string, number>();
  for (const place of [...pool].sort((left, right) => compareStableIds(left.id, right.id))) tieBreaks.set(place.id, random());
  return pool.filter((place) => !initial.some((selected) => selected.id === place.id)).map((place) => ({
    place,
    newCountry: !initiallyCovered.has(place.country),
    positions: insertionPositions(initial, place),
    dwellSeconds: stopDurationSeconds(stopTier(place)),
    populationPriority: Math.log10((place.population ?? 0) + 1) * 20,
    categoryPriority: categoryPreference(place, config) * 2,
    random: tieBreaks.get(place.id) ?? 0,
  })).sort((left, right) => Number(right.newCountry) - Number(left.newCountry)
    || ((left.positions[0]?.addedDistance ?? Number.POSITIVE_INFINITY) + left.dwellSeconds * 1.1
      - left.populationPriority - left.categoryPriority)
      - ((right.positions[0]?.addedDistance ?? Number.POSITIVE_INFINITY) + right.dwellSeconds * 1.1
        - right.populationPriority - right.categoryPriority)
    || left.random - right.random).map(({ place, positions, dwellSeconds }) => ({ place, positions, dwellSeconds }));
}

function insertionState(initial: TimedCandidate[], minimumSeparationKm: number): InsertionState {
  const counts = new Map<string, number>();
  const admin1Counts = new Map<string, number>();
  const bandCounts = new Map<number, number>();
  for (const place of initial) {
    counts.set(place.country, (counts.get(place.country) ?? 0) + 1);
    const unit = admin1UnitFor(place);
    if (unit) admin1Counts.set(unit, (admin1Counts.get(unit) ?? 0) + 1);
    const offset = requiredSnapshotOffset(place);
    bandCounts.set(offset, (bandCounts.get(offset) ?? 0) + 1);
  }
  const separation = new SeparationIndex(minimumSeparationKm);
  for (const place of initial) separation.add(place);
  return { route: [...initial], counts, admin1Counts, bandCounts, separation };
}

function insertionPlanIsAcceptable(plan: RoutePlan | undefined, eastward: number, detours: number,
  coverageTradeoff: boolean): plan is RoutePlan {
  if (!plan) return false;
  return (coverageTradeoff || eastwardCount(plan.places) <= eastward)
    && hardDetourCount(plan.places) <= detours;
}

function placeFitsNeighborBand(state: InsertionState, place: Candidate, index: number, pass: InsertionPass): boolean {
  const before = index > 0 ? state.route[index - 1] : undefined;
  const after = state.route[index];
  const offset = requiredSnapshotOffset(place);
  const neighbors = [before, after].filter((candidate): candidate is TimedCandidate => candidate !== undefined);
  return neighbors.every((candidate) => Math.abs(requiredSnapshotOffset(candidate) - offset) <= pass.bandSpreadMinutes);
}

function insertionOptions(state: InsertionState, place: Candidate, positions: RankedInsertion['positions'], pass: InsertionPass): RankedInsertion['positions'] {
  return positions.filter(({ index }) => placeFitsNeighborBand(state, place, index, pass)).slice(0, pass.maxPositionAttempts);
}

function insertionCoverageAllowsCandidate(state: InsertionState, place: Candidate, config: GeneratorConfig): boolean {
  const unit = admin1UnitFor(place);
  const addsRequiredAdmin1 = unit !== undefined && REQUIRED_ADMIN1_CODES.has(unit) && !state.admin1Counts.has(unit);
  const addsRequiredOffset = !state.bandCounts.has(requiredSnapshotOffset(place));
  return countryCapacity(place, state.counts, config) || addsRequiredAdmin1 || addsRequiredOffset;
}

function passesInsertionCandidateGates(state: InsertionState, item: RankedInsertion, pass: InsertionPass): boolean {
  if (pass.coverageOnly && state.counts.has(item.place.country)) return false;
  return insertionCoverageAllowsCandidate(state, item.place, pass.config) && state.separation.allows(item.place);
}

function addAtFeasiblePosition(state: InsertionState, place: Candidate, positions: RankedInsertion['positions'], pass: InsertionPass): boolean {
  if (pass.maxStops !== undefined && state.route.length >= pass.maxStops) return false;
  const offset = requiredSnapshotOffset(place);
  if (pass.maxStopsByBand && (state.bandCounts.get(offset) ?? 0) >= (pass.maxStopsByBand.get(offset) ?? 0)) return false;
  const priorEastward = eastwardCount(state.route);
  const priorDetours = hardDetourCount(state.route);
  const unit = admin1UnitFor(place);
  const addsRequiredAdmin1 = unit !== undefined && REQUIRED_ADMIN1_CODES.has(unit) && !state.admin1Counts.has(unit);
  const addsRequiredOffsetBand = !state.bandCounts.has(offset);
  const coverageTradeoff = !state.counts.has(place.country) || addsRequiredAdmin1 || addsRequiredOffsetBand;
  for (const { index } of insertionOptions(state, place, positions, pass)) {
    const proposal = [...state.route.slice(0, index), place, ...state.route.slice(index)];
    const plan = planTiming(proposal, pass.config);
    if (!insertionPlanIsAcceptable(plan, priorEastward, priorDetours, coverageTradeoff)) continue;
    state.route = plan.places;
    state.counts.set(place.country, (state.counts.get(place.country) ?? 0) + 1);
    const unit = admin1UnitFor(place);
    if (unit) state.admin1Counts.set(unit, (state.admin1Counts.get(unit) ?? 0) + 1);
    state.bandCounts.set(offset, (state.bandCounts.get(offset) ?? 0) + 1);
    state.separation.add(place);
    return true;
  }
  return false;
}

function tryInsertCandidate(state: InsertionState, item: RankedInsertion, pass: InsertionPass): void {
  // The country ceiling applies to optional dense fill. Mandatory country,
  // admin-1, and one-per-offset coverage may exceed it when needed.
  if (!passesInsertionCandidateGates(state, item, pass)) return;
  addAtFeasiblePosition(state, item.place, insertionPositions(state.route, item.place), pass);
}

export function insertFeasibleCandidates(initial: TimedCandidate[], pool: Candidate[], pass: InsertionPass): TimedCandidate[] {
  const state = insertionState(initial, pass.config.minStopSeparationKm);
  const initialCountries = new Set(initial.map((place) => place.country));
  const candidates = pass.coverageOnly ? pool.filter((place) => !initialCountries.has(place.country)) : pool;
  const ranked = rankInsertions(initial, candidates, pass.config);
  for (const item of ranked) tryInsertCandidate(state, item, pass);
  return state.route;
}

export function insertCountryCoverage(initial: TimedCandidate[], pool: Candidate[], config: GeneratorConfig): TimedCandidate[] {
  const pass: InsertionPass = {
    config,
    // Overlapping local windows make a feasible country representative
    // possible outside the two nearest offset bands. planOrder still checks
    // every arrival, eastward exception, detour, speed and return constraint.
    bandSpreadMinutes: Number.POSITIVE_INFINITY,
    coverageOnly: true,
    maxPositionAttempts: 40,
    maxStops: MAX_ROUTE_STOPS,
  };
  const state = insertionState(initial, config.minStopSeparationKm);
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = state.counts.size;
    const groups = rankCountryCoverageGroups(state, pool, pass);
    insertCountryCoverageGroups(state, groups, pass);
    if (state.counts.size === before) break;
  }
  return state.route;
}

type CountryCoverageCandidate = { place: Candidate; rank: number };
type CountryCoverageGroup = { country: string; rank: number; candidates: CountryCoverageCandidate[] };

function bestBandInsertionPosition(state: InsertionState, place: Candidate, pass: InsertionPass): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index <= state.route.length; index++) {
    if (!placeFitsNeighborBand(state, place, index, pass)) continue;
    const from = index === 0 ? NORTH_POLE : state.route[index - 1];
    const to = index === state.route.length ? NORTH_POLE : state.route[index];
    if (!from || !to) continue;
    const added = haversineKm(from, place) + haversineKm(place, to) - haversineKm(from, to);
    best = Math.min(best, added);
  }
  return best;
}

function rankCountryCoverageGroups(state: InsertionState, pool: Candidate[], pass: InsertionPass): CountryCoverageGroup[] {
  const initialIds = new Set(state.route.map((place) => place.id));
  const groups = new Map<string, CountryCoverageGroup>();
  for (const place of pool) {
    if (initialIds.has(place.id) || state.counts.has(place.country)) continue;
    const addedDistance = bestBandInsertionPosition(state, place, pass);
    if (!Number.isFinite(addedDistance)) continue;
    const dwellSeconds = stopDurationSeconds(stopTier(place));
    const rank = addedDistance + dwellSeconds * 1.1
      - Math.log10((place.population ?? 0) + 1) * 20
      - categoryPreference(place, pass.config) * 2;
    const group = groups.get(place.country) ?? { country: place.country, rank: Number.POSITIVE_INFINITY, candidates: [] };
    group.candidates.push({ place, rank });
    group.rank = Math.min(group.rank, rank);
    groups.set(place.country, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    candidates: group.candidates.sort((left, right) => left.rank - right.rank || compareStableIds(left.place.id, right.place.id)),
  })).sort((left, right) => left.rank - right.rank || compareStableIds(left.country, right.country));
}

function tryCountryRepresentative(state: InsertionState, place: Candidate, pass: InsertionPass): boolean {
  if (!state.separation.allows(place)) return false;
  const positions = insertionPositions(state.route, place);
  return addAtFeasiblePosition(state, place, positions, pass);
}

function insertCountryGroup(state: InsertionState, group: CountryCoverageGroup, pass: InsertionPass): void {
  if (state.counts.has(group.country)) return;
  // Keep alternatives so a representative whose best nearby splice is blocked
  // by timing or detours does not hide another feasible place in that country.
  for (const candidate of group.candidates.slice(0, 20)) {
    if (tryCountryRepresentative(state, candidate.place, pass)) return;
  }
}

function insertCountryCoverageGroups(state: InsertionState, groups: CountryCoverageGroup[], pass: InsertionPass): void {
  for (const group of groups) insertCountryGroup(state, group, pass);
}

type Admin1CoverageCandidate = { place: Candidate; rank: number };
type Admin1CoverageGroup = { unit: string; rank: number; candidates: Admin1CoverageCandidate[] };

function rankAdmin1Place(state: InsertionState, place: Candidate, unit: string, pass: InsertionPass): Admin1CoverageCandidate | undefined {
  if (admin1UnitFor(place) !== unit) return undefined;
  const addedDistance = bestBandInsertionPosition(state, place, pass);
  if (!Number.isFinite(addedDistance)) return undefined;
  const rank = addedDistance + stopDurationSeconds(stopTier(place)) * 1.1
    - Math.log10((place.population ?? 0) + 1) * 20
    - categoryPreference(place, pass.config) * 2;
  return { place, rank };
}

function rankAdmin1CoverageGroup(state: InsertionState, pool: Candidate[], unit: string, pass: InsertionPass): Admin1CoverageGroup | undefined {
  const candidates = pool.flatMap((place) => {
    const candidate = rankAdmin1Place(state, place, unit, pass);
    return candidate ? [candidate] : [];
  }).sort((left, right) => left.rank - right.rank || compareStableIds(left.place.id, right.place.id));
  if (candidates.length === 0) return undefined;
  return { unit, rank: candidates[0]!.rank, candidates };
}

function rankAdmin1CoverageGroups(state: InsertionState, pool: Candidate[], pass: InsertionPass): Admin1CoverageGroup[] {
  return [...REQUIRED_ADMIN1_CODES].flatMap((unit) => {
    if (state.admin1Counts.has(unit)) return [];
    const group = rankAdmin1CoverageGroup(state, pool, unit, pass);
    return group ? [group] : [];
  }).sort((left, right) => left.rank - right.rank || compareStableIds(left.unit, right.unit));
}

function insertAdmin1Group(state: InsertionState, group: Admin1CoverageGroup, pass: InsertionPass): void {
  if (state.admin1Counts.has(group.unit)) return;
  for (const candidate of group.candidates.slice(0, 20)) {
    if (!state.separation.allows(candidate.place)) continue;
    if (tryCountryRepresentative(state, candidate.place, pass)) break;
  }
}

function admin1CoverageAttempt(state: InsertionState, pool: Candidate[], pass: InsertionPass): boolean {
  const before = state.admin1Counts.size;
  const groups = rankAdmin1CoverageGroups(state, pool, pass);
  for (const group of groups) insertAdmin1Group(state, group, pass);
  return state.admin1Counts.size > before;
}

export function insertAdmin1Coverage(initial: TimedCandidate[], pool: Candidate[], config: GeneratorConfig): TimedCandidate[] {
  const pass: InsertionPass = { config, bandSpreadMinutes: Number.POSITIVE_INFINITY, coverageOnly: false,
    maxPositionAttempts: 40, maxStops: MAX_ROUTE_STOPS };
  const state = insertionState(initial, config.minStopSeparationKm);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!admin1CoverageAttempt(state, pool, pass)) break;
  }
  return state.route;
}

function insertOffsetBand(route: TimedCandidate[], pool: Candidate[], config: GeneratorConfig, offset: number): TimedCandidate[] {
  if (route.some((place) => requiredSnapshotOffset(place) === offset)) return route;
  const state = insertionState(route, config.minStopSeparationKm);
  const pass: InsertionPass = { config, bandSpreadMinutes: 60, coverageOnly: false,
    maxPositionAttempts: 40, maxStops: MAX_ROUTE_STOPS, maxStopsByBand: new Map([[offset, 1]]) };
  const candidates = rankInsertions(route, pool.filter((place) => requiredSnapshotOffset(place) === offset), config);
  for (const item of candidates) {
    tryInsertCandidate(state, item, pass);
    if (state.bandCounts.has(offset)) break;
  }
  return state.route;
}

export function insertOffsetBandCoverage(initial: TimedCandidate[], pool: Candidate[], config: GeneratorConfig): TimedCandidate[] {
  let route = initial;
  const offsets = [...new Set(pool.map(requiredSnapshotOffset))].sort((left, right) => right - left);
  for (const offset of offsets) route = insertOffsetBand(route, pool, config, offset);
  return route;
}

function placeImportance(place: Candidate, config: GeneratorConfig): number {
  return Math.log10((place.population ?? 0) + 1) * 20 + categoryPreference(place, config) * 2
    + (place.worldCity ? 5 : 0) + (place.capital || place.isCapital || place.isNationalCapital ? 10 : 0);
}

function placesByOffset(pool: Candidate[]): Map<number, Candidate[]> {
  const bandPlaces = new Map<number, Candidate[]>();
  for (const place of pool) {
    const offset = requiredSnapshotOffset(place);
    const rows = bandPlaces.get(offset) ?? [];
    rows.push(place);
    bandPlaces.set(offset, rows);
  }
  return bandPlaces;
}

function denseFillBandWeights(bandPlaces: Map<number, Candidate[]>): { offset: number; weight: number }[] {
  const populationByBand = new Map<number, number>();
  const cellsByBand = new Map<number, number>();
  for (const [offset, rows] of bandPlaces) {
    populationByBand.set(offset, rows.reduce((sum, place) => sum + Math.max(0, place.population ?? 0), 0));
    const cells = new Set(rows.map((place) => {
      const lng = ((place.lng + 180) % 360 + 360) % 360 - 180;
      return `${Math.floor((place.lat + 90) / 2)}:${Math.floor((lng + 180) / 2)}`;
    }));
    cellsByBand.set(offset, cells.size);
  }
  const totalPopulation = [...populationByBand.values()].reduce((sum, value) => sum + value, 0);
  const totalCells = [...cellsByBand.values()].reduce((sum, value) => sum + value, 0);
  return [...bandPlaces.keys()].map((offset) => ({
    offset,
    weight: 0.5 * ((populationByBand.get(offset) ?? 0) / (totalPopulation || 1))
      + 0.5 * ((cellsByBand.get(offset) ?? 0) / (totalCells || 1)),
  }));
}

function allocateBandFill(weights: { offset: number; weight: number }[], remaining: number): { offset: number; count: number }[] {
  const weightTotal = weights.reduce((sum, item) => sum + item.weight, 0) || 1;
  const allocations = weights.map(({ offset, weight }) => {
    const exact = remaining * weight / weightTotal;
    return { offset, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let unassigned = remaining - allocations.reduce((sum, item) => sum + item.count, 0);
  for (const item of allocations.sort((left, right) => right.remainder - left.remainder || right.offset - left.offset)) {
    if (unassigned <= 0) break;
    item.count++;
    unassigned--;
  }
  return allocations;
}

function mandatoryCountsByBand(mandatory: TimedCandidate[]): Map<number, number> {
  const current = new Map<number, number>();
  for (const place of mandatory) {
    const offset = requiredSnapshotOffset(place);
    current.set(offset, (current.get(offset) ?? 0) + 1);
  }
  return current;
}

export function bandMaximumStops(pool: Candidate[], mandatory: TimedCandidate[], maxStops: number): Map<number, number> {
  const bandPlaces = placesByOffset(pool);
  const weights = denseFillBandWeights(bandPlaces);
  const remaining = Math.max(0, maxStops - mandatory.length);
  const allocations = allocateBandFill(weights, remaining);
  const current = mandatoryCountsByBand(mandatory);
  return new Map(allocations.map((item) => [item.offset, (current.get(item.offset) ?? 0) + item.count]));
}

type MandatoryGroup = { key: string; candidates: Candidate[] };

type RepresentativeSelection = {
  separation: SeparationIndex;
  selected: Candidate[];
  selectedIds: Set<string>;
  coveredCountries: Set<string>;
  coveredAdmin1: Set<string>;
};

function representativeRank(place: Candidate, config: GeneratorConfig): number {
  return placeImportance(place, config) + (place.category === 'capital' ? 15 : 0);
}

function orderedMandatoryGroups(pool: Candidate[], keys: string[], keyOf: (place: Candidate) => string | undefined): MandatoryGroup[] {
  return keys.map((key) => ({ key, candidates: pool.filter((place) => keyOf(place) === key) }))
    .sort((left, right) => left.candidates.length - right.candidates.length || compareStableIds(left.key, right.key));
}

function chooseMandatoryRepresentative(group: MandatoryGroup, covered: Set<string>, selection: RepresentativeSelection,
  config: GeneratorConfig): void {
  if (covered.has(group.key)) return;
  const ordered = group.candidates.sort((left, right) => representativeRank(right, config) - representativeRank(left, config)
    || compareStableIds(left.id, right.id));
  for (const place of ordered) {
    if (selection.selectedIds.has(place.id) || !selection.separation.allows(place)) continue;
    selection.selected.push(place);
    selection.selectedIds.add(place.id);
    selection.separation.add(place);
    selection.coveredCountries.add(place.country);
    const unit = admin1UnitFor(place);
    if (unit) selection.coveredAdmin1.add(unit);
    covered.add(group.key);
    return;
  }
}

function selectRepresentatives(groups: MandatoryGroup[], covered: Set<string>, selection: RepresentativeSelection,
  config: GeneratorConfig): void {
  for (const group of groups) chooseMandatoryRepresentative(group, covered, selection, config);
}

export function selectMandatoryRepresentatives(pool: Candidate[], config: GeneratorConfig): Candidate[] {
  const selection: RepresentativeSelection = {
    separation: new SeparationIndex(config.minStopSeparationKm),
    selected: [],
    selectedIds: new Set(),
    coveredCountries: new Set(),
    coveredAdmin1: new Set(),
  };
  const adminGroups = orderedMandatoryGroups(pool, [...REQUIRED_ADMIN1_CODES], admin1UnitFor);
  selectRepresentatives(adminGroups, selection.coveredAdmin1, selection, config);
  const countryCodes = [...new Set(pool.map((place) => place.country))];
  selectRepresentatives(orderedMandatoryGroups(pool, countryCodes, (place) => place.country), selection.coveredCountries, selection, config);
  const coveredOffsets = new Set(selection.selected.map((place) => String(requiredSnapshotOffset(place))));
  const offsetCodes = [...new Set(pool.map((place) => String(requiredSnapshotOffset(place))))];
  const offsetGroups = orderedMandatoryGroups(pool, offsetCodes, (place) => String(requiredSnapshotOffset(place)))
    .sort((left, right) => left.candidates.length - right.candidates.length || Number(right.key) - Number(left.key));
  selectRepresentatives(offsetGroups, coveredOffsets, selection, config);
  return selection.selected;
}

export function mandatoryLaunch(representatives: Candidate[], pool: Candidate[], config: GeneratorConfig): {
  launch: Candidate;
  representatives: Candidate[];
} | undefined {
  const maxOffset = Math.max(...pool.map(requiredSnapshotOffset));
  const launchCandidates = pool.filter((place) => requiredSnapshotOffset(place) === maxOffset && canStartFromNorthPole(place, config));
  return launchCandidates.sort(compareLaunchPreference).map((launch) => launchWithRepresentatives(launch, representatives, config))
    .find((candidate): candidate is { launch: Candidate; representatives: Candidate[] } => candidate !== undefined);
}

function compareLaunchPreference(left: Candidate, right: Candidate): number {
  const leftLongitude = left.lng < 0 ? left.lng + 360 : left.lng;
  const rightLongitude = right.lng < 0 ? right.lng + 360 : right.lng;
  return rightLongitude - leftLongitude || right.lat - left.lat || compareStableIds(left.id, right.id);
}

function launchMatchesRequiredAdmin1(launch: Candidate, existing: Candidate | undefined, alreadySelected: boolean): boolean {
  const unit = existing ? admin1UnitFor(existing) : undefined;
  return alreadySelected || !unit || !REQUIRED_ADMIN1_CODES.has(unit) || launch.admin1Code === existing?.admin1Code;
}

function launchRepresentativePool(launch: Candidate, representatives: Candidate[], alreadySelected: boolean,
  existing: Candidate | undefined): Candidate[] {
  return alreadySelected
    ? representatives.filter((place) => place.id !== launch.id)
    : representatives.filter((place) => place.id !== existing?.id);
}

function launchIsSeparated(launch: Candidate, others: Candidate[], minimumKm: number): boolean {
  const separation = new SeparationIndex(minimumKm);
  for (const place of others) separation.add(place);
  return separation.allows(launch);
}

function launchWithRepresentatives(launch: Candidate, representatives: Candidate[], config: GeneratorConfig): {
  launch: Candidate;
  representatives: Candidate[];
} | undefined {
  const existing = representatives.find((place) => place.country === launch.country);
  const alreadySelected = representatives.some((place) => place.id === launch.id);
  if (!launchMatchesRequiredAdmin1(launch, existing, alreadySelected)) return undefined;
  const others = launchRepresentativePool(launch, representatives, alreadySelected, existing);
  if (!launchIsSeparated(launch, others, config.minStopSeparationKm)) return undefined;
  return { launch, representatives: alreadySelected ? others : [...others, launch] };
}

