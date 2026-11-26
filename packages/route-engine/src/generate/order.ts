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
import { DEFAULT_GENERATOR_LIMITS, NORTH_POLE, RETURN_DEADLINE_UTC, TAKEOFF_UTC, type Candidate, type GeneratorConfig } from './types';

const MINUTE_MS = 60_000;
const EARTH_RADIUS_KM = 6_371;
const LOCAL_CLUSTER_HOP_KM = 300;
const FAST_CROSSING_KM = 1_500;
const OCEAN_ISLAND_COUNTRIES = new Set([
  'AS', 'AW', 'AX', 'BB', 'BL', 'BM', 'BQ', 'BS', 'CC', 'CK', 'CX', 'CW', 'DM', 'FO', 'GD', 'GG', 'GL',
  'GP', 'GU', 'HM', 'IM', 'IO', 'IS', 'JE', 'JM', 'KN', 'KY', 'LC', 'MF', 'MH', 'MP', 'MQ', 'MS',
  'NF', 'NR', 'NU', 'PF', 'PN', 'PR', 'PW', 'RE', 'SC', 'SX', 'TC', 'TK', 'TO', 'TT', 'TV', 'VG', 'VI',
  'WF', 'YT',
]);

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

function selectionConstraintsAllow(order: Candidate[], config: GeneratorConfig): boolean {
  const countryCounts = new Map<string, number>();
  const separation = new SeparationIndex(config.minStopSeparationKm);
  for (const place of order) {
    if (!countryCapacity(place, countryCounts, config) || !separation.allows(place)) return false;
    countryCounts.set(place.country, (countryCounts.get(place.country) ?? 0) + 1);
    separation.add(place);
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
  // Route selection enforces 20 km separation, so a zero-length direct span
  // cannot occur in a valid sequence. Infinity remains a fail-closed guard
  // for a corrupted sequence supplied by a future caller.
  return detourRatio(beforePrior, prior, place) <= 2.5;
}

function categoryPreference(place: Candidate, config: GeneratorConfig): number {
  return config.weights[place.category] ?? 0;
}

function optionScore(options: {
  stop: PlannedStop;
  prior: Candidate | LatLng;
  priorDeparture: number;
  previousIdeal?: number;
  newCountry: boolean;
  isLaunch: boolean;
  latitudeDirection: -1 | 1;
  randomRank: number;
  config: GeneratorConfig;
}): number {
  const { stop, prior, priorDeparture, previousIdeal, newCountry, isLaunch, latitudeDirection, randomRank, config } = options;
  const place = stop.place;
  const distance = haversineKm(prior, place);
  const westwardDegrees = Math.max(0, -stop.eastwardDegrees);
  const latitudeProgress = Math.max(0, (place.lat - prior.lat) * latitudeDirection);
  const idleMinutes = Math.max(0, stop.arrival - priorDeparture) / MINUTE_MS;
  const offsetProgress = previousIdeal === undefined ? 0 : Math.max(0, (christmasWindow(requiredSnapshotOffset(place)).idealUtc - previousIdeal) / MINUTE_MS);
  const category = categoryPreference(place, config);
  const populationTie = Math.log10((place.population ?? 0) + 1);
  const dwellReward = (60 - place.plannedStopDurationSeconds) * 3;
  const launchBandPenalty = isLaunch ? Math.min(Math.abs(180 - place.lng), Math.abs(-180 - place.lng)) * 35 : 0;
  const eastwardPenalty = isEastwardDelta(stop.eastwardDegrees) ? 100_000 : 0;
  const localClusterBonus = distance <= LOCAL_CLUSTER_HOP_KM ? 1_000_000 : 0;
  return localClusterBonus
    + (newCountry ? 10_000 : 0)
    + westwardDegrees * 5
    + latitudeProgress * 75
    + Math.min(offsetProgress, 60) * 2
    - distance * 2
    - eastwardPenalty
    - launchBandPenalty
    - idleMinutes * 250
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
  return state.remaining.has(place.id)
    && countryCapacity(place, state.countryCounts, config)
    && state.separation.allows(place)
    && timingAndDetourAllows(place, state.route);
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
  state.separation.add(stop.place);
  state.prior = stop.place;
  state.priorDeparture = stop.departure;
}

function initialSweepState(pool: Candidate[], config: GeneratorConfig): SweepState {
  return {
    remaining: new Map(pool.map((place) => [place.id, place])),
    route: [],
    countryCounts: new Map(),
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

function executeGreedySweep(state: SweepState, bands: Candidate[][], randomRanks: Map<string, number>, config: GeneratorConfig): void {
  const bandIndices = new Map<string, number>();
  bands.forEach((band, index) => band.forEach((place) => bandIndices.set(place.id, index)));
  const ranking: SweepRanking = { bandIndices, randomRanks, config };
  // Bands define the alternating latitude direction. Their six-hour windows
  // overlap, so the nearest feasible local cluster may pull a stop from a
  // neighboring band forward without skipping the active regional path.
  while (state.remaining.size > 0) {
    const next = bestFeasibleStop(state, [...state.remaining.values()], ranking);
    // This ends the greedy phase, not candidate processing: stranded
    // candidates remain available to constrained insertion passes.
    if (!next) break;
    advanceSweep(state, next);
  }
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

function greedySweep(pool: Candidate[], config: GeneratorConfig): GreedySelection {
  const state = initialSweepState(pool, config);
  const randomRanks = seededCandidateRanks(pool, config.seed);
  const bands = offsetBands(pool);
  const first = firstFeasibleStart(pool, config);
  advanceSweep(state, { place: first, arrival: Date.parse(first.plannedArrivalUtc),
    departure: Date.parse(first.plannedArrivalUtc) + first.plannedStopDurationSeconds * 1000, eastwardDegrees: longitudeDelta(NORTH_POLE, first) });
  executeGreedySweep(state, bands, randomRanks, config);
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
    if (!stop || !timingAndDetourAllows(place, planned)) return undefined;
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

function moveOrOpt(order: Candidate[], from: number, to: number): Candidate[] {
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
  const firstPosition = Math.max(0, index - 1 - 6);
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
    const first = Math.floor(random() * best.length);
    const second = Math.floor(random() * best.length);
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
  for (let index = 0; index <= order.length; index++) {
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
type InsertionState = { route: TimedCandidate[]; counts: Map<string, number>; separation: SeparationIndex };
type InsertionPass = {
  config: GeneratorConfig;
  bandSpreadMinutes: number;
  coverageOnly: boolean;
  maxPositionAttempts: number;
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
  for (const place of initial) counts.set(place.country, (counts.get(place.country) ?? 0) + 1);
  const separation = new SeparationIndex(minimumSeparationKm);
  for (const place of initial) separation.add(place);
  return { route: [...initial], counts, separation };
}

function insertionPlanIsAcceptable(plan: RoutePlan | undefined, eastward: number, detours: number): plan is RoutePlan {
  if (!plan) return false;
  return eastwardCount(plan.places) <= eastward && detourCount(plan.places) <= detours;
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

function addAtFeasiblePosition(state: InsertionState, place: Candidate, positions: RankedInsertion['positions'], pass: InsertionPass): boolean {
  const priorEastward = eastwardCount(state.route);
  const priorDetours = detourCount(state.route);
  for (const { index } of insertionOptions(state, place, positions, pass)) {
    const proposal = [...state.route.slice(0, index), place, ...state.route.slice(index)];
    const plan = planTiming(proposal, pass.config);
    if (!insertionPlanIsAcceptable(plan, priorEastward, priorDetours)) continue;
    state.route = plan.places;
    state.counts.set(place.country, (state.counts.get(place.country) ?? 0) + 1);
    state.separation.add(place);
    return true;
  }
  return false;
}

function tryInsertCandidate(state: InsertionState, item: RankedInsertion, pass: InsertionPass): void {
  if (pass.coverageOnly && state.counts.has(item.place.country)) return;
  if (!countryCapacity(item.place, state.counts, pass.config)) return;
  if (!state.separation.allows(item.place)) return;
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
    // Try a few feasible splice points without making an uncovered country
    // evaluate every possible position in the full route.
    maxPositionAttempts: 20,
  };
  const state = insertionState(initial, config.minStopSeparationKm);
  for (let attempt = 0; attempt < 3; attempt++) {
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
  for (let index = 0; index <= state.route.length; index++) {
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
  // Try only the best few representatives. Failed candidates fall through to
  // the next one in the same country without spending the whole route budget.
  for (const candidate of group.candidates.slice(0, 8)) {
    if (tryCountryRepresentative(state, candidate.place, pass)) return;
  }
}

function insertCountryCoverageGroups(state: InsertionState, groups: CountryCoverageGroup[], pass: InsertionPass): void {
  for (const group of groups) insertCountryGroup(state, group, pass);
}

/** Greedy time-stepped midnight sweep followed by constrained 2-opt/or-opt improvements. */
export function sweepOrder(places: Candidate[], config: GeneratorConfig = DEFAULT_GENERATOR_LIMITS): Candidate[] {
  if (places.length === 0) throw new Error('Cannot order an empty route');
  places.forEach(requiredSnapshotOffset);
  const greedy = greedySweep(places, config);
  const initial = greedy.selected;
  const improved = improveWithLocalSearch(initial, config);
  // Try to secure one stop per still-uncovered candidate country before dense
  // population-weighted filling spends the remaining time budget.
  const coverageFirst = insertCountryCoverage(improved, places, config);
  const densePass: InsertionPass = { config, bandSpreadMinutes: 0, coverageOnly: false, maxPositionAttempts: 8 };
  const expanded = insertFeasibleCandidates(coverageFirst, places, densePass);
  const compacted = improveWithLocalSearch(expanded, config);
  const filled = insertFeasibleCandidates(compacted, places, densePass);
  const countryCoverage = insertCountryCoverage(filled, places, config);
  const finalOrder = improveWithLocalSearch(countryCoverage, config);
  const plan = planOrder(finalOrder, config);
  if (!plan) throw new Error('No route ordering satisfies the local Christmas window, speed limits, separation, and return deadline');
  return plan.places;
}

export function hasFeasibleTiming(order: Candidate[], config: GeneratorConfig = DEFAULT_GENERATOR_LIMITS): boolean {
  return planOrder(order, config) !== undefined;
}
