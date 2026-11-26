import { haversineKm, type LatLng } from '../geo';
import { detourRatio, isEastwardDelta, longitudeDelta } from './sweep';
import { compareStableIds } from './selection';
import { NORTH_POLE, RETURN_DEADLINE_UTC, TAKEOFF_UTC, type Candidate, type GeneratorConfig } from './types';
import { candidateTiming, hardDetourCount, planTiming, requiredSnapshotOffset, scheduledTravelMilliseconds, seededRandom, type TimedCandidate } from './order';

export function detourCount(order: Candidate[]): number {
  let count = 0;
  for (let index = 1; index < order.length - 1; index++) {
    const from = order[index - 1]!;
    const via = order[index]!;
    const to = order[index + 1]!;
    if (detourRatio(from, via, to) > 2.5) count++;
  }
  return count;
}

export function pathDistance(order: Candidate[]): number {
  if (order.length === 0) return 0;
  let total = haversineKm(NORTH_POLE, order[0]!);
  for (let index = 1; index < order.length; index++) total += haversineKm(order[index - 1]!, order[index]!);
  total += haversineKm(order.at(-1)!, NORTH_POLE);
  return total;
}

export function eastwardCount(order: Candidate[]): number {
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

export type RouteCost = { distance: number; eastward: number; detours: number };

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

export function canAcceptLocalProposal(cost: RouteCost, current: RouteCost): boolean {
  if (cost.eastward > current.eastward || cost.detours > current.detours) return false;
  return improvesSweep(cost, current) || improvesPath(cost, current);
}

export function improveWithLocalSearch(initial: TimedCandidate[], config: GeneratorConfig): TimedCandidate[] {
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

function unwrappedWestwardLongitude(place: Candidate, launch: Candidate): number {
  return place.lng + 360 * Math.floor((launch.lng - place.lng) / 360);
}

export function bandedBoustrophedonOrder(places: Candidate[], launch: Candidate, config: GeneratorConfig): Candidate[] {
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

function bandSegmentStart(order: Candidate[], source: number, band: number, sweepBandById: Map<string, number>): number {
  let start = source;
  while (start > 1 && sweepBandById.get(order[start - 1]?.id ?? '') === band) start--;
  return start;
}

function bandSegmentEnd(order: Candidate[], source: number, band: number, sweepBandById: Map<string, number>): number {
  let end = source;
  while (end < order.length - 2 && sweepBandById.get(order[end + 1]?.id ?? '') === band) end++;
  return end;
}

function bandSegment(order: Candidate[], source: number, sweepBandById: Map<string, number>): { band: number; start: number; end: number } | undefined {
  const band = sweepBandById.get(order[source]?.id ?? '');
  if (band === undefined) return undefined;
  return { band, start: bandSegmentStart(order, source, band, sweepBandById), end: bandSegmentEnd(order, source, band, sweepBandById) };
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
    tryBandOrOptFromSource({ order, source, search, current, sweepBandById, config });
  }
}

type BandOrOptSource = Omit<BandRepairOptions, 'firstFailure'> & { source: number };

function tryBandOrOptFromSource({ order, source, search, current, sweepBandById, config }: BandOrOptSource): void {
  const segment = bandSegment(order, source, sweepBandById);
  if (!segment) return;
  for (let target = segment.start; target <= segment.end; target++) {
    if (target !== source) considerBandProposal({ proposal: moveOrOpt(order, source, target), current, search, config });
  }
}

type BandSegmentCheck = { order: Candidate[]; left: number; right: number; band: number; sweepBandById: Map<string, number> };

function segmentHasOneBand({ order, left, right, band, sweepBandById }: BandSegmentCheck): boolean {
  return order.slice(left, right + 1).every((place) => sweepBandById.get(place.id) === band);
}

function tryBandTwoOptRepairs({ order, firstFailure, search, current, sweepBandById, config }: BandRepairOptions): void {
  const leftMin = Math.max(1, firstFailure - 8);
  const rightMax = Math.min(order.length - 2, firstFailure + 8);
  for (let left = leftMin; left <= firstFailure; left++) {
    for (let right = Math.max(firstFailure, left + 1); right <= rightMax; right++) {
      const band = sweepBandById.get(order[left]?.id ?? '');
      if (band === undefined || !segmentHasOneBand({ order, left, right, band, sweepBandById })) continue;
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
  for (const index of hardDetourIndexes(order)) {
    const proposal = repositionDetourAt({ order, index, currentCount, currentEastward, config });
    if (proposal) return proposal;
  }
  return undefined;
}

function hardDetourIndexes(order: Candidate[]): number[] {
  return order.map((_, index) => index).filter((index) => isHardDetourAt(order, index));
}

function repositionTargets(order: Candidate[], index: number): number[] {
  return order.map((_, target) => target).filter((target) => target > 0 && target !== index);
}

function acceptsDetourReposition(proposal: Candidate[], currentCount: number,
  currentEastward: number, config: GeneratorConfig): boolean {
  if (eastwardCount(proposal) > currentEastward) return false;
  if (hardDetourCount(proposal) >= currentCount) return false;
  return hasReasonedTiming(proposal, config);
}

type DetourRepositionOptions<T extends Candidate> = {
  order: T[];
  index: number;
  currentCount: number;
  currentEastward: number;
  config: GeneratorConfig;
};

function repositionDetourAt<T extends Candidate>({ order, index, currentCount, currentEastward, config }: DetourRepositionOptions<T>): T[] | undefined {
  for (const target of repositionTargets(order, index)) {
    const proposal = moveOrOpt(order, index, target);
    if (acceptsDetourReposition(proposal, currentCount, currentEastward, config)) return proposal;
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

export function reduceCoverageDetours(initial: Candidate[], config: GeneratorConfig): Candidate[] {
  let order = [...initial];
  while (true) {
    const improved = improveOneCoverageDetour(order, config);
    if (!improved) return order;
    order = improved;
  }
}

