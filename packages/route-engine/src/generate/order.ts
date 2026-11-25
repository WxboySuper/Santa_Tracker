import { haversineKm, type LatLng } from '../geo';
import {
  christmasWindow,
  detourRatio,
  eastwardLegReason,
  isEastwardDelta,
  longitudeDelta,
  stopDurationSeconds,
  stopTier,
} from './sweep';
import { DEFAULT_GENERATOR_LIMITS, NORTH_POLE, RETURN_DEADLINE_UTC, TAKEOFF_UTC, type Candidate, type GeneratorConfig } from './types';

const MINUTE_MS = 60_000;
const EARTH_RADIUS_KM = 6_371;

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

function planningSpeed(config: GeneratorConfig): number {
  return Math.min(config.maxLegSpeedKmh, config.p90LegSpeedMaxKmh * 0.95);
}

function travelMilliseconds(distanceKm: number, speedKmh: number): number {
  return Math.ceil(distanceKm / speedKmh * 3_600) * 1000;
}

function countryCapacity(place: Candidate, counts: Map<string, number>, config: GeneratorConfig): boolean {
  return (counts.get(place.country) ?? 0) < config.maxStopsPerCountry;
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

function candidateTiming({ place, prior, priorDeparture, index, config }: CandidateTimingOptions): PlannedStop | undefined {
  const distance = haversineKm(prior, place);
  const window = christmasWindow(place.utcOffsetMinutes ?? 0);
  const earliest = Math.max(window.startUtc, priorDeparture + travelMilliseconds(distance, planningSpeed(config)));
  const arrival = Math.max(earliest, window.idealUtc);
  if (arrival > window.endUtc) return undefined;

  const reason = eastwardLegReason({ from: prior, to: place, destinationIndex: index, arrivalUtc: arrival });
  const eastwardDegrees = longitudeDelta(prior, place);
  if (isEastwardDelta(eastwardDegrees) && !reason) return undefined;

  const tier = stopTier(place);
  const durationSeconds = stopDurationSeconds(tier);
  const departure = arrival + durationSeconds * 1000;
  const returnArrival = departure + travelMilliseconds(haversineKm(place, NORTH_POLE), planningSpeed(config));
  if (returnArrival > Date.parse(RETURN_DEADLINE_UTC)) return undefined;
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
  randomRank: number;
  config: GeneratorConfig;
}): number {
  const { stop, prior, priorDeparture, previousIdeal, newCountry, isLaunch, randomRank, config } = options;
  const place = stop.place;
  const distance = haversineKm(prior, place);
  const westwardDegrees = Math.max(0, -stop.eastwardDegrees);
  const idleMinutes = Math.max(0, stop.arrival - priorDeparture) / MINUTE_MS;
  const lateMinutes = Math.max(0, stop.arrival - christmasWindow(place.utcOffsetMinutes ?? 0).idealUtc) / MINUTE_MS;
  const offsetProgress = previousIdeal === undefined ? 0 : Math.max(0, (previousIdeal - christmasWindow(place.utcOffsetMinutes ?? 0).idealUtc) / MINUTE_MS);
  const category = categoryPreference(place, config);
  const populationTie = Math.log10((place.population ?? 0) + 1);
  const launchBandPenalty = isLaunch ? Math.min(Math.abs(180 - place.lng), Math.abs(-180 - place.lng)) * 35 : 0;
  const eastwardPenalty = isEastwardDelta(stop.eastwardDegrees) ? 8_000 : 0;
  return (newCountry ? 15_000 : 0)
    + westwardDegrees * 5
    + offsetProgress * 2
    - distance * 0.25
    - eastwardPenalty
    - launchBandPenalty
    - idleMinutes * 5
    - lateMinutes * 10
    + category * 2
    + populationTie * 0.5
    + randomRank * 0.01;
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

function previousIdeal(route: TimedCandidate[]): number | undefined {
  const last = route.at(-1);
  return last?.utcOffsetMinutes === undefined ? undefined : christmasWindow(last.utcOffsetMinutes).idealUtc;
}

function betterPlannedStop(candidate: PlannedStop, score: number, best: PlannedStop | undefined, bestScore: number): boolean {
  return score > bestScore || (score === bestScore && candidate.place.id.localeCompare(best?.place.id ?? '') < 0);
}

function bestFeasibleStop(state: SweepState, randomRanks: Map<string, number>, config: GeneratorConfig): PlannedStop | undefined {
  let best: PlannedStop | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of state.remaining.values()) {
    if (!countryCapacity(candidate, state.countryCounts, config) || !state.separation.allows(candidate)) continue;
    if (!timingAndDetourAllows(candidate, state.route)) continue;
    const stop = candidateTiming({ place: candidate, prior: state.prior, priorDeparture: state.priorDeparture,
      index: state.route.length, config });
    if (!stop) continue;
    const score = optionScore({ stop, prior: state.prior, priorDeparture: state.priorDeparture,
      previousIdeal: previousIdeal(state.route), newCountry: !state.countryCounts.has(candidate.country),
      isLaunch: state.route.length === 0, randomRank: randomRanks.get(candidate.id) ?? 0, config });
    if (!betterPlannedStop(stop, score, best, bestScore)) continue;
    best = stop;
    bestScore = score;
  }
  return best;
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
  for (const place of [...pool].sort((a, b) => a.id.localeCompare(b.id))) randomRanks.set(place.id, random());
  return randomRanks;
}

function executeGreedySweep(state: SweepState, randomRanks: Map<string, number>, config: GeneratorConfig): void {
  while (state.remaining.size > 0) {
    const next = bestFeasibleStop(state, randomRanks, config);
    if (!next) break;
    advanceSweep(state, next);
  }
}

function firstFeasibleStart(pool: Candidate[], config: GeneratorConfig): TimedCandidate {
  const candidate = pool.filter((place) => canStartFromNorthPole(place, config))
    .sort((left, right) => (left.population ?? 0) - (right.population ?? 0) || left.id.localeCompare(right.id))[0];
  if (!candidate) throw new Error('No candidate can be reached within its local Christmas window and the return deadline');
  const first = candidateTiming({ place: candidate, prior: NORTH_POLE, priorDeparture: Date.parse(TAKEOFF_UTC), index: 0, config });
  if (!first) throw new Error(`Cannot schedule the first route stop: ${candidate.name}`);
  return first.place;
}

function greedySweep(pool: Candidate[], config: GeneratorConfig): TimedCandidate[] {
  const state = initialSweepState(pool, config);
  const randomRanks = seededCandidateRanks(pool, config.seed);
  executeGreedySweep(state, randomRanks, config);
  if (state.route.length > 0) return state.route;
  return [firstFeasibleStart(pool, config)];
}

function planOrder(order: Candidate[], config: GeneratorConfig): RoutePlan | undefined {
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
  if (finalDeparture + travelMilliseconds(haversineKm(final, NORTH_POLE), planningSpeed(config)) > Date.parse(RETURN_DEADLINE_UTC)) return undefined;
  return { places: planned, arrivalTimes, departures };
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
    const plan = planOrder(proposal, config);
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
    const proposal = localProposal(best, first, second, random);
    const cost = routeCost(proposal);
    if (!canAcceptLocalProposal(cost, bestCost)) continue;
    const planned = planOrder(proposal, config);
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

type RankedInsertion = { place: Candidate; positions: { index: number; addedDistance: number }[] };
type InsertionState = { route: TimedCandidate[]; counts: Map<string, number>; separation: SeparationIndex };

function rankInsertions(initial: TimedCandidate[], pool: Candidate[], seed: number): RankedInsertion[] {
  const initiallyCovered = new Set(initial.map((place) => place.country));
  const random = seededRandom(seed ^ 0x27d4eb2d);
  const tieBreaks = new Map<string, number>();
  for (const place of [...pool].sort((left, right) => left.id.localeCompare(right.id))) tieBreaks.set(place.id, random());
  return pool.filter((place) => !initial.some((selected) => selected.id === place.id)).map((place) => ({
    place,
    newCountry: !initiallyCovered.has(place.country),
    positions: insertionPositions(initial, place),
    random: tieBreaks.get(place.id) ?? 0,
  })).sort((left, right) => Number(right.newCountry) - Number(left.newCountry)
    || (left.positions[0]?.addedDistance ?? Number.POSITIVE_INFINITY) - (right.positions[0]?.addedDistance ?? Number.POSITIVE_INFINITY)
    || left.random - right.random).map(({ place, positions }) => ({ place, positions }));
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

function addAtFeasiblePosition(state: InsertionState, place: Candidate, positions: RankedInsertion['positions'], config: GeneratorConfig): boolean {
  const priorEastward = eastwardCount(state.route);
  const priorDetours = detourCount(state.route);
  for (const { index } of positions.slice(0, 5)) {
    const proposal = [...state.route.slice(0, index), place, ...state.route.slice(index)];
    const plan = planOrder(proposal, config);
    if (!insertionPlanIsAcceptable(plan, priorEastward, priorDetours)) continue;
    state.route = plan.places;
    state.counts.set(place.country, (state.counts.get(place.country) ?? 0) + 1);
    state.separation.add(place);
    return true;
  }
  return false;
}

function tryInsertCandidate(state: InsertionState, item: RankedInsertion, config: GeneratorConfig): void {
  if (!countryCapacity(item.place, state.counts, config)) return;
  if (!state.separation.allows(item.place)) return;
  addAtFeasiblePosition(state, item.place, item.positions, config);
}

function insertFeasibleCandidates(initial: TimedCandidate[], pool: Candidate[], config: GeneratorConfig): TimedCandidate[] {
  const state = insertionState(initial, config.minStopSeparationKm);
  const ranked = rankInsertions(initial, pool, config.seed);
  for (const item of ranked) tryInsertCandidate(state, item, config);
  return state.route;
}

/** Greedy time-stepped midnight sweep followed by constrained 2-opt/or-opt improvements. */
export function sweepOrder(places: Candidate[], config: GeneratorConfig = DEFAULT_GENERATOR_LIMITS): Candidate[] {
  if (places.length === 0) throw new Error('Cannot order an empty route');
  const initial = greedySweep(places, config);
  const improved = improveWithLocalSearch(initial, config);
  const expanded = insertFeasibleCandidates(improved, places, config);
  const finalOrder = improveWithLocalSearch(expanded, config);
  const plan = planOrder(finalOrder, config);
  if (!plan) throw new Error('No route ordering satisfies the local Christmas window, speed limits, separation, and return deadline');
  return plan.places;
}

export function hasFeasibleTiming(order: Candidate[], config: GeneratorConfig = DEFAULT_GENERATOR_LIMITS): boolean {
  return planOrder(order, config) !== undefined;
}
