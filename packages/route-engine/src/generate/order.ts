import { haversineKm, type LatLng } from '../geo';
import { christmasWindow, isEastwardDelta, longitudeDelta } from './sweep';
import { compareStableIds } from './selection';
import { admin1UnitFor } from './admin1';
import { bandMaximumStops, insertAdmin1Coverage, insertCountryCoverage, insertFeasibleCandidates, insertOffsetBandCoverage, mandatoryLaunch, selectMandatoryRepresentatives, type InsertionPass } from './order-coverage';
import { bandedBoustrophedonOrder, improveWithLocalSearch, reduceCoverageDetours } from './order-path';
import {
  candidateTiming,
  canStartFromNorthPole,
  categoryPreference,
  countryCapacity,
  hardDetourCount,
  MAX_ROUTE_STOPS,
  planTiming,
  REQUIRED_ADMIN1_CODES,
  requiredSnapshotOffset,
  seededRandom,
  SeparationIndex,
  timingAndDetourAllows,
  type PlannedStop,
  type RoutePlan,
  type TimedCandidate,
} from './order-shared';
import { DEFAULT_GENERATOR_LIMITS, NORTH_POLE, TAKEOFF_UTC, type Candidate, type GeneratorConfig } from './types';

export {
  candidateTiming,
  canStartFromNorthPole,
  categoryPreference,
  countryCapacity,
  hardDetourCount,
  MAX_ROUTE_STOPS,
  planTiming,
  requiredSnapshotOffset,
  scheduledTravelMilliseconds,
  seededRandom,
  SeparationIndex,
  timingAndDetourAllows,
  REQUIRED_ADMIN1_CODES,
} from './order-shared';
export type { PlannedStop, RoutePlan, TimedCandidate } from './order-shared';

const MINUTE_MS = 60_000;
const LOCAL_CLUSTER_HOP_KM = 300;

type CoverageCapOptions = { place: Candidate; countryCounts: Map<string, number>; coveredAdmin1: Set<string>;
  coveredOffsets: Set<number>; config: GeneratorConfig };

function requiredCoverageAllowsCountryCap({ place, countryCounts, coveredAdmin1, coveredOffsets, config }: CoverageCapOptions): boolean {
  const unit = admin1UnitFor(place);
  const addsRequiredAdmin1 = unit !== undefined && REQUIRED_ADMIN1_CODES.has(unit) && !coveredAdmin1.has(unit);
  const addsRequiredOffsetBand = !coveredOffsets.has(requiredSnapshotOffset(place));
  if (countryCapacity(place, countryCounts, config)) return true;
  if (addsRequiredAdmin1) return true;
  return addsRequiredOffsetBand;
}

function recordSelectionCoverage(place: Candidate, countryCounts: Map<string, number>, coveredAdmin1: Set<string>,
  coveredOffsets: Set<number>): void {
  countryCounts.set(place.country, (countryCounts.get(place.country) ?? 0) + 1);
  const unit = admin1UnitFor(place);
  if (unit) coveredAdmin1.add(unit);
  coveredOffsets.add(requiredSnapshotOffset(place));
}

function selectionConstraintsAllow(order: Candidate[], config: GeneratorConfig): boolean {
  const separation = new SeparationIndex(config.minStopSeparationKm);
  const countryCounts = new Map<string, number>();
  const coveredAdmin1 = new Set<string>();
  const coveredOffsets = new Set<number>();
  for (const place of order) {
    if (!separation.allows(place)) return false;
    if (!requiredCoverageAllowsCountryCap({ place, countryCounts, coveredAdmin1, coveredOffsets, config })) return false;
    separation.add(place);
    recordSelectionCoverage(place, countryCounts, coveredAdmin1, coveredOffsets);
  }
  return true;
}

function scoreCoverage(newCountry: boolean, newAdmin1: boolean): number {
  return Number(newCountry) * 100_000_000 + Number(newAdmin1) * 100_000_000;
}

function scoreOffsetProgress(place: Candidate, previousIdeal?: number): number {
  if (previousIdeal === undefined) return 0;
  const delta = (christmasWindow(requiredSnapshotOffset(place)).idealUtc - previousIdeal) / MINUTE_MS;
  return Math.min(Math.max(0, delta), 60) * 2;
}

function scoreBandContinuity(place: Candidate, prior: Candidate | LatLng): number {
  const priorOffset = 'utcOffsetMinutes' in prior ? prior.utcOffsetMinutes : undefined;
  if (priorOffset === undefined) return 0;
  return -Math.abs(requiredSnapshotOffset(place) - priorOffset) * 5_000;
}

function scoreLaunchPenalty(place: Candidate, isLaunch: boolean): number {
  if (!isLaunch) return 0;
  return Math.min(Math.abs(180 - place.lng), Math.abs(-180 - place.lng)) * 35;
}

function scoreLocalCluster(distance: number): number {
  return distance <= LOCAL_CLUSTER_HOP_KM ? 5_000_000 : 0;
}

function optionScore(options: {
  stop: PlannedStop;
  prior: Candidate | LatLng;
  priorDeparture: number;
  previousIdeal?: number;
  newCountry: boolean;
  newAdmin1: boolean;
  isLaunch: boolean;
  latitudeDirection: -1 | 1;
  randomRank: number;
  config: GeneratorConfig;
}): number {
  const { stop, prior, priorDeparture, previousIdeal, newCountry, newAdmin1, isLaunch, latitudeDirection, randomRank, config } = options;
  const place = stop.place;
  const distance = haversineKm(prior, place);
  const westwardDegrees = Math.max(0, -stop.eastwardDegrees);
  const latitudeProgress = Math.max(0, (place.lat - prior.lat) * latitudeDirection);
  const idleMinutes = Math.max(0, stop.arrival - priorDeparture) / MINUTE_MS;
  const category = categoryPreference(place, config);
  const populationTie = Math.log10((place.population ?? 0) + 1);
  const dwellReward = (60 - place.plannedStopDurationSeconds) * 3;
  const eastwardPenalty = isEastwardDelta(stop.eastwardDegrees) ? 100_000 : 0;
  return scoreLocalCluster(distance)
    // Reward nearby mandatory coverage while keeping distant jumps behind a
    // short regional chain. The idle penalty keeps later-offset islands late.
    + scoreCoverage(newCountry, newAdmin1)
    + scoreBandContinuity(place, prior)
    + westwardDegrees * 5
    + latitudeProgress * 75
    + scoreOffsetProgress(place, previousIdeal)
    - distance * 200
    - eastwardPenalty
    - scoreLaunchPenalty(place, isLaunch)
    - idleMinutes * 10_000
    + dwellReward
    + category * 0.1
    + populationTie * 2
    + randomRank * 25;
}

type SweepState = {
  remaining: Map<string, Candidate>;
  route: TimedCandidate[];
  countryCounts: Map<string, number>;
  admin1Counts: Map<string, number>;
  bandCounts: Map<number, number>;
  separation: SeparationIndex;
  prior: Candidate | LatLng;
  priorDeparture: number;
};
type GreedySelection = { selected: TimedCandidate[]; unselected: Candidate[] };

type SweepRanking = {
  bandIndices: Map<string, number>;
  randomRanks: Map<string, number>;
  config: GeneratorConfig;
};

type RankedStop = { stop: PlannedStop; score: number };

function betterPlannedStop(candidate: PlannedStop, score: number, best: PlannedStop | undefined, bestScore: number): boolean {
  return score > bestScore || (score === bestScore && compareStableIds(candidate.place.id, best?.place.id ?? '') < 0);
}

function previousIdeal(route: TimedCandidate[]): number | undefined {
  const last = route.at(-1);
  return last?.utcOffsetMinutes === undefined ? undefined : christmasWindow(last.utcOffsetMinutes).idealUtc;
}

function candidateCanExtendRoute(state: SweepState, place: Candidate, config: GeneratorConfig): boolean {
  if (!state.remaining.has(place.id)) return false;
  if (!state.separation.allows(place)) return false;
  const addsRequiredAdmin1 = isNewRequiredAdmin1(place, state.admin1Counts);
  const addsRequiredOffsetBand = !state.bandCounts.has(requiredSnapshotOffset(place));
  const addsCountryCoverage = !state.countryCounts.has(place.country);
  const hasCountryCapacity = countryCapacity(place, state.countryCounts, config);
  if (hasCountryCapacity) return extensionPassesTiming(place, addsCountryCoverage, addsRequiredAdmin1, state.route);
  if (addsRequiredAdmin1) return extensionPassesTiming(place, addsCountryCoverage, true, state.route);
  if (addsRequiredOffsetBand) return extensionPassesTiming(place, addsCountryCoverage, false, state.route);
  return false;
}

function extensionPassesTiming(place: Candidate, addsCountryCoverage: boolean, addsRequiredAdmin1: boolean,
  route: Candidate[]): boolean {
  if (addsCountryCoverage) return true;
  if (addsRequiredAdmin1) return true;
  return timingAndDetourAllows(place, route);
}

function isNewRequiredAdmin1(place: Candidate, coveredAdmin1: Map<string, number>): boolean {
  const unit = admin1UnitFor(place);
  return unit !== undefined && REQUIRED_ADMIN1_CODES.has(unit) && !coveredAdmin1.has(unit);
}

function scoreFeasibleCandidate(state: SweepState, place: Candidate, ranking: SweepRanking): RankedStop | undefined {
  const { config, bandIndices, randomRanks } = ranking;
  if (!candidateCanExtendRoute(state, place, config)) return undefined;
  const stop = candidateTiming({ place, prior: state.prior, priorDeparture: state.priorDeparture,
    index: state.route.length, config });
  if (!stop) return undefined;
  const score = optionScore({ stop, prior: state.prior,
    priorDeparture: state.priorDeparture, previousIdeal: previousIdeal(state.route),
    newCountry: !state.countryCounts.has(place.country),
    newAdmin1: isNewRequiredAdmin1(place, state.admin1Counts),
    isLaunch: state.route.length === 0,
    latitudeDirection: (bandIndices.get(place.id) ?? 0) % 2 === 0 ? -1 : 1,
    randomRank: randomRanks.get(place.id) ?? 0, config });
  return { stop, score };
}

function bestFeasibleStop(state: SweepState, candidates: Candidate[], ranking: SweepRanking): PlannedStop | undefined {
  let best: RankedStop | undefined;
  for (const place of candidates) {
    const candidate = scoreFeasibleCandidate(state, place, ranking);
    if (!candidate) continue;
    if (best && !betterPlannedStop(candidate.stop, candidate.score, best.stop, best.score)) continue;
    best = candidate;
  }
  return best?.stop;
}

function advanceSweep(state: SweepState, stop: PlannedStop): void {
  state.route.push(stop.place);
  state.remaining.delete(stop.place.id);
  state.countryCounts.set(stop.place.country, (state.countryCounts.get(stop.place.country) ?? 0) + 1);
  const unit = admin1UnitFor(stop.place);
  if (unit) state.admin1Counts.set(unit, (state.admin1Counts.get(unit) ?? 0) + 1);
  const offset = requiredSnapshotOffset(stop.place);
  state.bandCounts.set(offset, (state.bandCounts.get(offset) ?? 0) + 1);
  state.separation.add(stop.place);
  state.prior = stop.place;
  state.priorDeparture = stop.departure;
}

function initialSweepState(pool: Candidate[], config: GeneratorConfig): SweepState {
  return {
    remaining: new Map(pool.map((place) => [place.id, place])),
    route: [],
    countryCounts: new Map(),
    admin1Counts: new Map(),
    bandCounts: new Map(),
    separation: new SeparationIndex(config.minStopSeparationKm),
    prior: NORTH_POLE,
    priorDeparture: Date.parse(TAKEOFF_UTC),
  };
}

function seededCandidateRanks(pool: Candidate[], seed: number): Map<string, number> {
  const random = seededRandom(seed);
  const randomRanks = new Map<string, number>();
  for (const place of [...pool].sort((a, b) => compareStableIds(a.id, b.id))) randomRanks.set(place.id, random());
  return randomRanks;
}

function offsetBands(pool: Candidate[]): Candidate[][] {
  const bands = new Map<number, Candidate[]>();
  for (const place of pool) {
    const offset = requiredSnapshotOffset(place);
    const band = bands.get(offset) ?? [];
    band.push(place);
    bands.set(offset, band);
  }
  return [...bands.entries()].sort(([left], [right]) => right - left).map(([, places]) => places);
}

function mandatoryCandidatesInBand(state: SweepState, available: Candidate[]): Candidate[] {
  return available.filter((place) => candidateIsMandatoryCoverage(state, place));
}

function candidateIsMandatoryCoverage(state: SweepState, place: Candidate): boolean {
  const unit = admin1UnitFor(place);
  return !state.countryCounts.has(place.country)
    || (unit !== undefined && REQUIRED_ADMIN1_CODES.has(unit) && !state.admin1Counts.has(unit))
    || !state.bandCounts.has(requiredSnapshotOffset(place));
}

type SweepChoiceOptions = {
  state: SweepState;
  available: Candidate[];
  ranking: SweepRanking;
  withinBandBudget: boolean;
  includeDenseFill: boolean;
};

function chooseSweepCandidate({ state, available, ranking, withinBandBudget, includeDenseFill }: SweepChoiceOptions): PlannedStop | undefined {
  const mandatory = mandatoryCandidatesInBand(state, available);
  const nextMandatory = mandatory.length > 0 ? bestFeasibleStop(state, mandatory, ranking) : undefined;
  return nextMandatory ?? (includeDenseFill && withinBandBudget ? bestFeasibleStop(state, available, ranking) : undefined);
}

type SweepBandOptions = {
  state: SweepState;
  band: Candidate[];
  ranking: SweepRanking;
  bandCaps: Map<number, number>;
  routeBandCounts: Map<number, number>;
  includeDenseFill: boolean;
};

function sweepOffsetBand({ state, band, ranking, bandCaps, routeBandCounts, includeDenseFill }: SweepBandOptions): void {
  const offset = band[0] ? requiredSnapshotOffset(band[0]) : undefined;
  if (offset === undefined) return;
  while (state.remaining.size > 0 && state.route.length < MAX_ROUTE_STOPS) {
    const available = band.filter((place) => state.remaining.has(place.id));
    if (available.length === 0) break;
    const withinBandBudget = (routeBandCounts.get(offset) ?? 0) < (bandCaps.get(offset) ?? 0);
    const next = chooseSweepCandidate({ state, available, ranking, withinBandBudget, includeDenseFill });
    if (!next) break;
    advanceSweep(state, next);
    routeBandCounts.set(offset, (routeBandCounts.get(offset) ?? 0) + 1);
  }
}

type GreedySweepOptions = {
  state: SweepState;
  bands: Candidate[][];
  randomRanks: Map<string, number>;
  config: GeneratorConfig;
  includeDenseFill: boolean;
};

function executeGreedySweep({ state, bands, randomRanks, config, includeDenseFill }: GreedySweepOptions): void {
  const bandIndices = new Map<string, number>();
  bands.forEach((band, index) => band.forEach((place) => bandIndices.set(place.id, index)));
  const ranking: SweepRanking = { bandIndices, randomRanks, config };
  const bandCaps = bandMaximumStops([...state.remaining.values()], [], MAX_ROUTE_STOPS);
  const routeBandCounts = new Map<number, number>();
  for (const band of bands) sweepOffsetBand({ state, band, ranking, bandCaps, routeBandCounts, includeDenseFill });
}

function firstFeasibleStart(pool: Candidate[], config: GeneratorConfig): TimedCandidate {
  const candidate = pool.filter((place) => canStartFromNorthPole(place, config))
    .sort((left, right) => requiredSnapshotOffset(right) - requiredSnapshotOffset(left)
      || compareStableIds(left.id, right.id))[0];
  if (!candidate) throw new Error('No candidate can be reached within its local Christmas window and the return deadline');
  const first = candidateTiming({ place: candidate, prior: NORTH_POLE, priorDeparture: Date.parse(TAKEOFF_UTC), index: 0, config });
  if (!first) throw new Error(`Cannot schedule the first route stop: ${candidate.name}`);
  return first.place;
}

function greedySweep(pool: Candidate[], config: GeneratorConfig, includeDenseFill = true): GreedySelection {
  const state = initialSweepState(pool, config);
  const randomRanks = seededCandidateRanks(pool, config.seed);
  const bands = offsetBands(pool);
  const first = firstFeasibleStart(pool, config);
  advanceSweep(state, { place: first, arrival: Date.parse(first.plannedArrivalUtc),
    departure: Date.parse(first.plannedArrivalUtc) + first.plannedStopDurationSeconds * 1000, eastwardDegrees: longitudeDelta(NORTH_POLE, first) });
  executeGreedySweep({ state, bands, randomRanks, config, includeDenseFill });
  return { selected: state.route, unselected: [...state.remaining.values()] };
}

function planOrder(order: Candidate[], config: GeneratorConfig): RoutePlan | undefined {
  if (!selectionConstraintsAllow(order, config)) return undefined;
  return planTiming(order, config);
}

function planMandatoryRoute(pool: Candidate[], config: GeneratorConfig): TimedCandidate[] | undefined {
  const mandatory = mandatoryLaunch(selectMandatoryRepresentatives(pool, config), pool, config);
  if (!mandatory) return undefined;
  const { representatives, launch } = mandatory;
  if (representatives.length === 0 || representatives.length > MAX_ROUTE_STOPS) return undefined;
  const ordered = bandedBoustrophedonOrder(representatives, launch, config);
  const detourFree = reduceCoverageDetours(ordered, config);
  if (hardDetourCount(detourFree) > 0) return undefined;
  const initialPlan = planOrder(detourFree, config);
  if (!initialPlan) return undefined;
  return planOrder(improveWithLocalSearch(initialPlan.places, config), config)?.places;
}

function expandMandatoryRoute(initial: TimedCandidate[], pool: Candidate[], config: GeneratorConfig): Candidate[] | undefined {
  const densePass: InsertionPass = {
    config,
    bandSpreadMinutes: 60,
    coverageOnly: false,
    maxPositionAttempts: 24,
    maxStops: MAX_ROUTE_STOPS,
    maxStopsByBand: bandMaximumStops(pool, initial, MAX_ROUTE_STOPS),
  };
  const expanded = insertFeasibleCandidates(initial, pool, densePass);
  return planOrder(improveWithLocalSearch(expanded, config), config)?.places;
}

function greedyCoverageRoute(pool: Candidate[], config: GeneratorConfig): TimedCandidate[] {
  // Reserve coverage before spending time on dense fill. The sweep traverses
  // the exact UTC bands first, then insertion uses the remaining route slack
  // to place any country or admin-1 representative the band pass could not
  // reach directly.
  const greedy = greedySweep(pool, config, false);
  const initial = greedy.selected;
  const improved = improveWithLocalSearch(initial, config);
  const countryCoverage = insertCountryCoverage(improved, pool, config);
  const adminCoverage = insertAdmin1Coverage(countryCoverage, pool, config);
  const offsetCoverage = insertOffsetBandCoverage(adminCoverage, pool, config);
  const mandatory = improveWithLocalSearch(offsetCoverage, config);
  if (mandatory.length > MAX_ROUTE_STOPS) throw new Error(`Mandatory coverage requires ${mandatory.length} stops, above the ${MAX_ROUTE_STOPS}-stop route ceiling`);
  return mandatory;
}

function expandGreedyCoverageRoute(mandatory: TimedCandidate[], pool: Candidate[], config: GeneratorConfig): Candidate[] | undefined {
  const densePass: InsertionPass = {
    config,
    bandSpreadMinutes: 60,
    coverageOnly: false,
    maxPositionAttempts: 24,
    maxStops: MAX_ROUTE_STOPS,
    maxStopsByBand: bandMaximumStops(pool, mandatory, MAX_ROUTE_STOPS),
  };
  const expanded = insertFeasibleCandidates(mandatory, pool, densePass);
  const optimized = improveWithLocalSearch(expanded, config);
  const finalOrder = reduceCoverageDetours(optimized, config);
  return planOrder(finalOrder, config)?.places;
}

/** Greedy time-stepped midnight sweep followed by constrained 2-opt/or-opt improvements. */
export function sweepOrder(places: Candidate[], config: GeneratorConfig = DEFAULT_GENERATOR_LIMITS): Candidate[] {
  if (places.length === 0) throw new Error('Cannot order an empty route');
  places.forEach(requiredSnapshotOffset);
  const mandatoryRoute = planMandatoryRoute(places, config);
  if (mandatoryRoute) {
    const expanded = expandMandatoryRoute(mandatoryRoute, places, config);
    if (expanded) return expanded;
  }
  const mandatory = greedyCoverageRoute(places, config);
  const route = expandGreedyCoverageRoute(mandatory, places, config);
  if (!route) throw new Error('No route ordering satisfies the local Christmas window, speed limits, separation, and return deadline');
  return route;
}

export function hasFeasibleTiming(order: Candidate[], config: GeneratorConfig = DEFAULT_GENERATOR_LIMITS): boolean {
  return planOrder(order, config) !== undefined;
}
