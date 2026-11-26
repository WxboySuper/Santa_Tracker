import { haversineKm, type LatLng } from '../geo';
import {
  christmasWindow,
  christmasArrival,
  detourRatio,
  eastwardLegReason,
  isEastwardDelta,
  longitudeDelta,
  stopDurationSeconds,
  stopTier,
} from './sweep';
import { classifyRegion } from './regions';
import { compareStableIds } from './selection';
import { admin1UnitFor, REQUIRED_ADMIN1_UNITS } from './admin1';
import { DEFAULT_GENERATOR_LIMITS, NORTH_POLE, RETURN_DEADLINE_UTC, TAKEOFF_UTC, type Candidate, type GeneratorConfig } from './types';

const MINUTE_MS = 60_000;
const EARTH_RADIUS_KM = 6_371;
const LOCAL_CLUSTER_HOP_KM = 300;
const FAST_CROSSING_KM = 1_500;
const MAX_ROUTE_STOPS = 700;
const OCEAN_ISLAND_COUNTRIES = new Set([
  'AS', 'AW', 'AX', 'BB', 'BL', 'BM', 'BQ', 'BS', 'CC', 'CK', 'CX', 'CW', 'DM', 'FO', 'GD', 'GG', 'GL',
  'GP', 'GU', 'HM', 'IM', 'IO', 'IS', 'JE', 'JM', 'KN', 'KY', 'LC', 'MF', 'MH', 'MP', 'MQ', 'MS',
  'NF', 'NR', 'NU', 'PF', 'PN', 'PR', 'PW', 'RE', 'SC', 'SX', 'TC', 'TK', 'TO', 'TT', 'TV', 'VG', 'VI',
  'WF', 'YT',
]);
const REQUIRED_ADMIN1_CODES = new Set<string>(Object.values(REQUIRED_ADMIN1_UNITS).flatMap((codes) => [...codes]));

type TimedCandidate = Candidate & { plannedArrivalUtc: string; plannedStopTier: NonNullable<Candidate['plannedStopTier']>; plannedStopDurationSeconds: number };
type PlannedStop = { place: TimedCandidate; arrival: number; departure: number; eastwardDegrees: number };
type RoutePlan = { places: TimedCandidate[]; arrivalTimes: number[]; departures: number[] };

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function isOceanCrossing(from: Candidate | LatLng, to: Candidate | LatLng, distanceKm: number): boolean {
  if (distanceKm < FAST_CROSSING_KM) return false;
  if (!('country' in from) || !('country' in to)) return true;
  if (OCEAN_ISLAND_COUNTRIES.has(from.country) || OCEAN_ISLAND_COUNTRIES.has(to.country)) return true;
  const fromRegion = classifyRegion(from);
  const toRegion = classifyRegion(to);
  return fromRegion.pacificIsland || toRegion.pacificIsland || fromRegion.continent !== toRegion.continent;
}

function planningSpeed(from: Candidate | LatLng, to: Candidate | LatLng, distanceKm: number, config: GeneratorConfig): number {
  const target = isOceanCrossing(from, to, distanceKm) ? config.targetLegSpeedKmh : config.localLegSpeedKmh;
  return Math.min(target, config.maxLegSpeedKmh, config.p90LegSpeedMaxKmh * 0.95);
}

export function scheduledTravelMilliseconds(from: Candidate | LatLng, to: Candidate | LatLng, config: GeneratorConfig): number {
  const distance = haversineKm(from, to);
  const travelSeconds = Math.ceil(distance / planningSpeed(from, to, distance, config) * 3_600);
  return travelSeconds * 1000;
}

function countryCapacity(place: Candidate, counts: Map<string, number>, config: GeneratorConfig): boolean {
  return (counts.get(place.country) ?? 0) < config.maxStopsPerCountry;
}

function requiredCoverageAllowsCountryCap(place: Candidate, countryCounts: Map<string, number>, coveredAdmin1: Set<string>,
  coveredOffsets: Set<number>, config: GeneratorConfig): boolean {
  const unit = admin1UnitFor(place);
  const addsRequiredAdmin1 = unit !== undefined && REQUIRED_ADMIN1_CODES.has(unit) && !coveredAdmin1.has(unit);
  const addsRequiredOffsetBand = !coveredOffsets.has(requiredSnapshotOffset(place));
  return countryCapacity(place, countryCounts, config) || addsRequiredAdmin1 || addsRequiredOffsetBand;
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
    if (!separation.allows(place) || !requiredCoverageAllowsCountryCap(place, countryCounts, coveredAdmin1, coveredOffsets, config)) return false;
    separation.add(place);
    recordSelectionCoverage(place, countryCounts, coveredAdmin1, coveredOffsets);
  }
  return true;
}

function separationCell(place: LatLng, cellSize: number): string {
  const latitude = place.lat * Math.PI / 180;
  const longitude = place.lng * Math.PI / 180;
  const x = Math.cos(latitude) * Math.cos(longitude);
  const y = Math.cos(latitude) * Math.sin(longitude);
  const z = Math.sin(latitude);
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`;
}

function cellCoordinates(key: string): [number, number, number] {
  return key.split(',').map(Number) as [number, number, number];
}

function adjacentCellKeys(x: number, y: number, z: number): string[] {
  return Array.from({ length: 27 }, (_, index) => {
    const dx = index % 3 - 1;
    const dy = Math.floor(index / 3) % 3 - 1;
    const dz = Math.floor(index / 9) - 1;
    return `${x + dx},${y + dy},${z + dz}`;
  });
}

class SeparationIndex {
  private readonly cells = new Map<string, Candidate[]>();
  private readonly cellSize: number;

  constructor(private readonly minimumKm: number) {
    this.cellSize = Math.max(minimumKm / EARTH_RADIUS_KM, 0.00001);
  }

  add(place: Candidate): void {
    const key = separationCell(place, this.cellSize);
    const members = this.cells.get(key) ?? [];
    members.push(place);
    this.cells.set(key, members);
  }

  allows(place: Candidate): boolean {
    if (this.minimumKm <= 0) return true;
    const [x, y, z] = cellCoordinates(separationCell(place, this.cellSize));
    const nearby = adjacentCellKeys(x, y, z).flatMap((key) => this.cells.get(key) ?? []);
    return nearby.every((candidate) => haversineKm(candidate, place) >= this.minimumKm);
  }
}

type CandidateTimingOptions = {
  place: Candidate;
  prior: Candidate | LatLng;
  priorDeparture: number;
  index: number;
  config: GeneratorConfig;
};

function latestLocalArrival(place: Candidate, window: ReturnType<typeof christmasWindow>): number {
  if (place.lat >= -35) return window.endUtc;
  const southernLimit = Date.parse(christmasArrival({ timezoneOrOffset: requiredSnapshotOffset(place), minutesAfterMidnight: 150 }));
  return Math.min(window.endUtc, southernLimit);
}

function requiredSnapshotOffset(place: Candidate): number {
  if (!Number.isInteger(place.utcOffsetMinutes)) throw new Error(`Missing snapshot UTC offset for ${place.name}`);
  return place.utcOffsetMinutes!;
}

function deliveryLongitudeIsAllowed(prior: Candidate | LatLng, place: Candidate, index: number, arrival: number): boolean {
  const degrees = longitudeDelta(prior, place);
  if (!isEastwardDelta(degrees)) return true;
  // A small-looking eastward jog is still a reversal; only the owner's two
  // documented exceptions make an eastward delivery leg admissible.
  const reason = eastwardLegReason({ from: prior, to: place, destinationIndex: index, arrivalUtc: arrival });
  return reason === 'dateline' || reason === 'offset-anomaly';
}

export function candidateTiming({ place, prior, priorDeparture, index, config }: CandidateTimingOptions): PlannedStop | undefined {
  const window = christmasWindow(requiredSnapshotOffset(place));
  const arrival = Math.max(window.startUtc, priorDeparture + scheduledTravelMilliseconds(prior, place, config));
  if (arrival > latestLocalArrival(place, window)) return undefined;
  if (!deliveryLongitudeIsAllowed(prior, place, index, arrival)) return undefined;

  const eastwardDegrees = longitudeDelta(prior, place);
  const tier = stopTier(place);
  const durationSeconds = stopDurationSeconds(tier);
  const departure = arrival + durationSeconds * 1000;
  return {
    place: { ...place, plannedArrivalUtc: new Date(arrival).toISOString(), plannedStopTier: tier, plannedStopDurationSeconds: durationSeconds },
    arrival,
    departure,
    eastwardDegrees,
  };
}

function timingAndDetourAllows(place: Candidate, route: Candidate[]): boolean {
  const prior = route.at(-1);
  if (!prior) return true;
  if (route.length < 2) return true;
  const beforePrior = route.at(-2);
  if (!beforePrior) return true;
  // A lone country representative may sit off the shortest regional path;
  // the audit treats that via-stop as an explicit coverage warning. When a
  // country already has multiple stops, its route segments must stay within
  // the 2.5x detour limit.
  if (route.filter((candidate) => candidate.country === prior.country).length === 1) return true;
  // Route selection enforces 20 km separation, so a zero-length direct span
  // cannot occur in a valid sequence. Infinity remains a fail-closed guard
  // for a corrupted sequence supplied by a future caller.
  return detourRatio(beforePrior, prior, place) <= 2.5;
}

function categoryPreference(place: Candidate, config: GeneratorConfig): number {
  if (place.category === 'capital') return config.weights.hub ?? 0;
  return config.weights[place.category] ?? 0;
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

function canStartFromNorthPole(place: Candidate, config: GeneratorConfig): boolean {
  return Boolean(candidateTiming({ place, prior: NORTH_POLE, priorDeparture: Date.parse(TAKEOFF_UTC), index: 0, config }));
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
  if (!state.remaining.has(place.id) || !state.separation.allows(place)) return false;
  const addsRequiredAdmin1 = isNewRequiredAdmin1(place, state.admin1Counts);
  const addsRequiredOffsetBand = !state.bandCounts.has(requiredSnapshotOffset(place));
  const addsCountryCoverage = !state.countryCounts.has(place.country);
  if (!countryCapacity(place, state.countryCounts, config) && !addsRequiredAdmin1 && !addsRequiredOffsetBand) return false;
  return addsCountryCoverage || addsRequiredAdmin1 || timingAndDetourAllows(place, state.route);
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

function planTiming(order: Candidate[], config: GeneratorConfig): RoutePlan | undefined {
  const planned: TimedCandidate[] = [];
  const arrivalTimes: number[] = [];
  const departures: number[] = [];
  let prior: Candidate | LatLng = NORTH_POLE;
  let priorDeparture = Date.parse(TAKEOFF_UTC);
  for (const [index, place] of order.entries()) {
    const stop = candidateTiming({ place, prior, priorDeparture, index, config });
    if (!stop) return undefined;
    planned.push(stop.place);
    arrivalTimes.push(stop.arrival);
    departures.push(stop.departure);
    prior = stop.place;
    priorDeparture = stop.departure;
  }
  if (planned.length === 0) return undefined;
  const final = planned.at(-1);
  const finalDeparture = departures.at(-1);
  if (!final || finalDeparture === undefined) return undefined;
  if (finalDeparture + scheduledTravelMilliseconds(final, NORTH_POLE, config) > Date.parse(RETURN_DEADLINE_UTC)) return undefined;
  return { places: planned, arrivalTimes, departures };
}

function planOrder(order: Candidate[], config: GeneratorConfig): RoutePlan | undefined {
  if (!selectionConstraintsAllow(order, config)) return undefined;
  return planTiming(order, config);
}

function detourCount(order: Candidate[]): number {
  let count = 0;
  for (let index = 1; index < order.length - 1; index++) {
    const from = order[index - 1]!;
    const via = order[index]!;
    const to = order[index + 1]!;
    if (detourRatio(from, via, to) > 2.5) count++;
  }
  return count;
}

function pathDistance(order: Candidate[]): number {
  if (order.length === 0) return 0;
  let total = haversineKm(NORTH_POLE, order[0]!);
  for (let index = 1; index < order.length; index++) total += haversineKm(order[index - 1]!, order[index]!);
  total += haversineKm(order.at(-1)!, NORTH_POLE);
  return total;
}

function eastwardCount(order: Candidate[]): number {
  let count = isEastwardDelta(longitudeDelta(NORTH_POLE, order[0]!)) ? 1 : 0;
  for (let index = 1; index < order.length; index++) {
    if (isEastwardDelta(longitudeDelta(order[index - 1]!, order[index]!))) count++;
  }
  return count;
}

function moveTwoOpt(order: Candidate[], left: number, right: number): Candidate[] {
  return [...order.slice(0, left), ...order.slice(left, right + 1).reverse(), ...order.slice(right + 1)];
}

function moveOrOpt<T extends Candidate>(order: T[], from: number, to: number): T[] {
  const result = [...order];
  const [place] = result.splice(from, 1);
  if (!place) return order;
  result.splice(to, 0, place);
  return result;
}

function isEastwardAt(order: Candidate[], index: number): boolean {
  return isEastwardDelta(longitudeDelta(order[index - 1]!, order[index]!));
}

function reducesBacktracking(order: Candidate[], eastward: number, detours: number): boolean {
  if (eastwardCount(order) >= eastward) return false;
  return detourCount(order) <= detours;
}

function reduceEastwardAt(best: TimedCandidate[], index: number, config: GeneratorConfig): TimedCandidate[] | undefined {
  if (!isEastwardAt(best, index)) return undefined;
  const priorEastward = eastwardCount(best);
  const priorDetours = detourCount(best);
  const firstPosition = Math.max(1, index - 1 - 6);
  for (let target = index - 1; target >= firstPosition; target--) {
    const proposal = moveOrOpt(best, index, target);
    if (!reducesBacktracking(proposal, priorEastward, priorDetours)) continue;
    const plan = planTiming(proposal, config);
    if (plan) return plan.places;
  }
  return undefined;
}

function findEastwardReduction(best: TimedCandidate[], config: GeneratorConfig): TimedCandidate[] | undefined {
  for (let index = 1; index < best.length; index++) {
    const reduced = reduceEastwardAt(best, index, config);
    if (reduced) return reduced;
  }
  return undefined;
}

function reduceEastwardMoves(initial: TimedCandidate[], config: GeneratorConfig): TimedCandidate[] {
  let best = [...initial];
  while (true) {
    const improved = findEastwardReduction(best, config);
    if (!improved) return best;
    best = improved;
  }
}

type RouteCost = { distance: number; eastward: number; detours: number };

function routeCost(order: Candidate[]): RouteCost {
  return { distance: pathDistance(order), eastward: eastwardCount(order), detours: detourCount(order) };
}

function localProposal(order: Candidate[], first: number, second: number, random: () => number): Candidate[] {
  if (random() < 0.5 && first !== second) {
    return moveTwoOpt(order, Math.min(first, second), Math.max(first, second));
  }
  return moveOrOpt(order, first, second);
}

function sameOffsetBand(order: Candidate[], first: number, second: number): boolean {
  const offset = order[first]?.utcOffsetMinutes;
  if (offset === undefined || order[second]?.utcOffsetMinutes !== offset) return false;
  const start = Math.min(first, second);
  const end = Math.max(first, second);
  return order.slice(start, end + 1).every((place) => place.utcOffsetMinutes === offset);
}

function improvesSweep(cost: RouteCost, current: RouteCost): boolean {
  if (cost.eastward > current.eastward || cost.detours > current.detours) return false;
  return cost.eastward < current.eastward || cost.detours < current.detours;
}

function improvesPath(cost: RouteCost, current: RouteCost): boolean {
  return cost.distance < current.distance - 0.01;
}

function canAcceptLocalProposal(cost: RouteCost, current: RouteCost): boolean {
  return improvesSweep(cost, current) || improvesPath(cost, current);
}

function improveWithLocalSearch(initial: TimedCandidate[], config: GeneratorConfig): TimedCandidate[] {
  if (initial.length < 4) return initial;
  const random = seededRandom(config.seed ^ 0x5f3759df);
  let best = reduceEastwardMoves(initial, config);
  let bestCost = routeCost(best);
  const attempts = Math.min(2_000, Math.max(150, best.length * 2));

  for (let attempt = 0; attempt < attempts; attempt++) {
    const first = 1 + Math.floor(random() * Math.max(1, best.length - 1));
    const second = 1 + Math.floor(random() * Math.max(1, best.length - 1));
    if (!sameOffsetBand(best, first, second)) continue;
    const proposal = localProposal(best, first, second, random);
    const cost = routeCost(proposal);
    if (!canAcceptLocalProposal(cost, bestCost)) continue;
    const planned = planTiming(proposal, config);
    if (!planned) continue;
    best = planned.places;
    bestCost = cost;
  }
  return best;
}

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
type InsertionPass = {
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

function hardDetourCount(order: Candidate[]): number {
  const countryCounts = new Map<string, number>();
  for (const place of order) countryCounts.set(place.country, (countryCounts.get(place.country) ?? 0) + 1);
  return order.reduce((count, via, index) => {
    const before = order[index - 1];
    const after = order[index + 1];
    return before && after && (countryCounts.get(via.country) ?? 0) > 1 && detourRatio(before, via, after) > 2.5
      ? count + 1 : count;
  }, 0);
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

function insertFeasibleCandidates(initial: TimedCandidate[], pool: Candidate[], pass: InsertionPass): TimedCandidate[] {
  const state = insertionState(initial, pass.config.minStopSeparationKm);
  const initialCountries = new Set(initial.map((place) => place.country));
  const candidates = pass.coverageOnly ? pool.filter((place) => !initialCountries.has(place.country)) : pool;
  const ranked = rankInsertions(initial, candidates, pass.config);
  for (const item of ranked) tryInsertCandidate(state, item, pass);
  return state.route;
}

function insertCountryCoverage(initial: TimedCandidate[], pool: Candidate[], config: GeneratorConfig): TimedCandidate[] {
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

function insertAdmin1Coverage(initial: TimedCandidate[], pool: Candidate[], config: GeneratorConfig): TimedCandidate[] {
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

function insertOffsetBandCoverage(initial: TimedCandidate[], pool: Candidate[], config: GeneratorConfig): TimedCandidate[] {
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

function bandMaximumStops(pool: Candidate[], mandatory: TimedCandidate[], maxStops: number): Map<number, number> {
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

function selectMandatoryRepresentatives(pool: Candidate[], config: GeneratorConfig): Candidate[] {
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

function mandatoryLaunch(representatives: Candidate[], pool: Candidate[], config: GeneratorConfig): {
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

function unwrappedWestwardLongitude(place: Candidate, launch: Candidate): number {
  return place.lng + 360 * Math.floor((launch.lng - place.lng) / 360);
}

function bandedBoustrophedonOrder(places: Candidate[], launch: Candidate, config: GeneratorConfig): Candidate[] {
  const ordered: Candidate[] = [launch];
  const bands = new Map<number, Candidate[]>();
  const sweepBandById = new Map<string, number>();
  for (const place of places) {
    if (place.id === launch.id) continue;
    const offsetBand = requiredSnapshotOffset(place);
    const band = bands.get(offsetBand) ?? [];
    band.push(place);
    bands.set(offsetBand, band);
    sweepBandById.set(place.id, offsetBand);
  }
  [...bands.entries()].sort(([left], [right]) => right - left).forEach(([, placesInBand], offsetBandIndex) => {
    const latitudeDirection: -1 | 1 = offsetBandIndex % 2 === 0 ? -1 : 1;
    ordered.push(...placesInBand.sort((left, right) => {
      const longitudeDifference = unwrappedWestwardLongitude(right, launch) - unwrappedWestwardLongitude(left, launch);
      if (Math.abs(longitudeDifference) > 0.25) return longitudeDifference;
      return (left.lat - right.lat) * latitudeDirection || compareStableIds(left.id, right.id);
    }));
  });
  return improveBandedPath(ordered, config, sweepBandById);
}

function timingPrefixLength(order: Candidate[], config: GeneratorConfig): number {
  let prior: Candidate | LatLng = NORTH_POLE;
  let departure = Date.parse(TAKEOFF_UTC);
  for (const [index, place] of order.entries()) {
    const stop = candidateTiming({ place, prior, priorDeparture: departure, index, config });
    if (!stop) return index;
    prior = stop.place;
    departure = stop.departure;
  }
  const last = order.at(-1);
  return last && departure + scheduledTravelMilliseconds(last, NORTH_POLE, config) <= Date.parse(RETURN_DEADLINE_UTC)
    ? order.length : order.length - 1;
}

function betterBandProposal(candidate: { prefix: number; detours: number; eastward: number; distance: number },
  current: { prefix: number; detours: number; eastward: number; distance: number }): boolean {
  if (candidate.prefix !== current.prefix) return candidate.prefix > current.prefix;
  if (candidate.detours !== current.detours) return candidate.detours < current.detours;
  if (candidate.eastward !== current.eastward) return candidate.eastward < current.eastward;
  return candidate.distance < current.distance - 0.01;
}

type BandPathScore = { prefix: number; detours: number; eastward: number; distance: number };
type BandPathSearch = { best?: Candidate[]; bestScore: BandPathScore };

function bandPathScore(order: Candidate[], config: GeneratorConfig): BandPathScore {
  return { prefix: timingPrefixLength(order, config), detours: detourCount(order),
    eastward: eastwardCount(order), distance: pathDistance(order) };
}

type BandProposalOptions = { proposal: Candidate[]; current: BandPathScore; search: BandPathSearch; config: GeneratorConfig };

function considerBandProposal({ proposal, current, search, config }: BandProposalOptions): void {
  const score = bandPathScore(proposal, config);
  if (score.detours > current.detours || score.eastward > current.eastward) return;
  if (!betterBandProposal(score, search.bestScore)) return;
  search.best = proposal;
  search.bestScore = score;
}

function bandSegment(order: Candidate[], source: number, sweepBandById: Map<string, number>): { band: number; start: number; end: number } | undefined {
  const band = sweepBandById.get(order[source]?.id ?? '');
  if (band === undefined) return undefined;
  let start = source;
  let end = source;
  while (start > 1 && sweepBandById.get(order[start - 1]?.id ?? '') === band) start--;
  while (end < order.length - 2 && sweepBandById.get(order[end + 1]?.id ?? '') === band) end++;
  return { band, start, end };
}

type BandRepairOptions = {
  order: Candidate[];
  firstFailure: number;
  search: BandPathSearch;
  current: BandPathScore;
  sweepBandById: Map<string, number>;
  config: GeneratorConfig;
};

function tryBandOrOptRepairs({ order, firstFailure, search, current, sweepBandById, config }: BandRepairOptions): void {
  for (const source of [firstFailure - 2, firstFailure - 1, firstFailure]) {
    if (source < 1 || source >= order.length - 1) continue;
    const segment = bandSegment(order, source, sweepBandById);
    if (!segment) continue;
    for (let target = segment.start; target <= segment.end; target++) {
      if (target !== source) considerBandProposal({ proposal: moveOrOpt(order, source, target), current, search, config });
    }
  }
}

function segmentHasOneBand(order: Candidate[], left: number, right: number, band: number,
  sweepBandById: Map<string, number>): boolean {
  return order.slice(left, right + 1).every((place) => sweepBandById.get(place.id) === band);
}

function tryBandTwoOptRepairs({ order, firstFailure, search, current, sweepBandById, config }: BandRepairOptions): void {
  const leftMin = Math.max(1, firstFailure - 8);
  const rightMax = Math.min(order.length - 2, firstFailure + 8);
  for (let left = leftMin; left <= firstFailure; left++) {
    for (let right = Math.max(firstFailure, left + 1); right <= rightMax; right++) {
      const band = sweepBandById.get(order[left]?.id ?? '');
      if (band === undefined || !segmentHasOneBand(order, left, right, band, sweepBandById)) continue;
      considerBandProposal({ proposal: moveTwoOpt(order, left, right), current, search, config });
    }
  }
}

function firstHardDetourIndex(order: Candidate[]): number {
  return order.findIndex((place, index) => {
    const before = order[index - 1];
    const after = order[index + 1];
    return !!before && !!after && detourRatio(before, place, after) > 2.5;
  });
}

function tryDetourOrOptRepairs({ order, search, current, sweepBandById, config }: Omit<BandRepairOptions, 'firstFailure'>): void {
  const detourIndex = firstHardDetourIndex(order);
  if (detourIndex <= 0) return;
  const segment = bandSegment(order, detourIndex, sweepBandById);
  if (!segment) return;
  for (let target = segment.start; target <= segment.end; target++) {
    if (target !== detourIndex) considerBandProposal({ proposal: moveOrOpt(order, detourIndex, target), current, search, config });
  }
}

function improveBandedPath(initial: Candidate[], config: GeneratorConfig, sweepBandById: Map<string, number>): Candidate[] {
  let order = [...initial];
  for (let pass = 0; pass < 100; pass++) {
    const current = bandPathScore(order, config);
    const search: BandPathSearch = { bestScore: current };
    if (current.prefix < order.length) {
      const options = { order, firstFailure: current.prefix, search, current, sweepBandById, config };
      tryBandOrOptRepairs(options);
      tryBandTwoOptRepairs(options);
    } else {
      tryDetourOrOptRepairs({ order, search, current, sweepBandById, config });
    }
    if (!search.best) return order;
    order = search.best;
  }
  return order;
}

function hasReasonedTiming(order: Candidate[], config: GeneratorConfig): boolean {
  let prior: Candidate | LatLng = NORTH_POLE;
  let departure = Date.parse(TAKEOFF_UTC);
  for (const [index, place] of order.entries()) {
    const stop = candidateTiming({ place, prior, priorDeparture: departure, index, config });
    if (!stop) return false;
    prior = stop.place;
    departure = stop.departure;
  }
  const last = order.at(-1);
  return !!last && departure + scheduledTravelMilliseconds(last, NORTH_POLE, config) <= Date.parse(RETURN_DEADLINE_UTC);
}

function countryStopCounts(order: Candidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const place of order) counts.set(place.country, (counts.get(place.country) ?? 0) + 1);
  return counts;
}

function isHardDetourAt(order: Candidate[], index: number): boolean {
  const via = order[index];
  const before = order[index - 1];
  const after = order[index + 1];
  return !!via && !!before && !!after && detourRatio(before, via, after) > 2.5;
}

function isRepeatedCountryDetour(order: Candidate[], index: number, counts: Map<string, number>): boolean {
  const via = order[index];
  return isHardDetourAt(order, index) && !!via && (counts.get(via.country) ?? 0) >= 2;
}

function moveCoverageDetourToTail<T extends Candidate>(order: T[], currentCount: number,
  counts: Map<string, number>, config: GeneratorConfig): T[] | undefined {
  for (let index = 1; index < order.length - 1; index++) {
    const via = order[index];
    if (!via || !isRepeatedCountryDetour(order, index, counts)) continue;
    // An isolated required place such as Hawaii can be moved to the route
    // tail, where its North Pole return leg replaces the detour. Any new
    // reversal still has to pass the offset-anomaly timing rule.
    const proposal = [...order.slice(0, index), ...order.slice(index + 1), via];
    if (hardDetourCount(proposal) < currentCount && hasReasonedTiming(proposal, config)) return proposal;
  }
  return undefined;
}

function repositionCoverageDetour<T extends Candidate>(order: T[], currentCount: number,
  currentEastward: number, config: GeneratorConfig): T[] | undefined {
  for (let index = 1; index < order.length - 1; index++) {
    if (!isHardDetourAt(order, index)) continue;
    for (let target = 1; target < order.length; target++) {
      if (target === index) continue;
      const proposal = moveOrOpt(order, index, target);
      if (eastwardCount(proposal) > currentEastward) continue;
      if (hardDetourCount(proposal) >= currentCount || !hasReasonedTiming(proposal, config)) continue;
      return proposal;
    }
  }
  return undefined;
}

function improveOneCoverageDetour<T extends Candidate>(order: T[], config: GeneratorConfig): T[] | undefined {
  const currentCount = hardDetourCount(order);
  if (currentCount === 0) return undefined;
  const countryCounts = countryStopCounts(order);
  return moveCoverageDetourToTail(order, currentCount, countryCounts, config)
    ?? repositionCoverageDetour(order, currentCount, eastwardCount(order), config);
}

function reduceCoverageDetours<T extends Candidate>(initial: T[], config: GeneratorConfig): T[] {
  let order = [...initial];
  while (true) {
    const improved = improveOneCoverageDetour(order, config);
    if (!improved) return order;
    order = improved;
  }
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
