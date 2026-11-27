import { haversineKm, type LatLng } from '../geo';
import { detourRatio, isEastwardDelta, longitudeDelta } from './sweep';
import { compareStableIds } from './selection';
import { admin1UnitFor } from './admin1';
import { NORTH_POLE, RETURN_DEADLINE_UTC, TAKEOFF_UTC, type Candidate, type GeneratorConfig } from './types';
import { candidateTiming, countryCapacity, hardDetourCount, planTiming, requiredSnapshotOffset, scheduledTravelMilliseconds, seededRandom,
  REQUIRED_ADMIN1_CODES, SeparationIndex, type RoutePlan, type TimedCandidate } from './order-shared';

export type RouteMetrics = { eastward: number; detours?: number; hardDetours: number; distance?: number };

function routeMetrics(order: Candidate[], includePathCost = true): RouteMetrics {
  const metrics: RouteMetrics = { eastward: eastwardCount(order), hardDetours: hardDetourCount(order) };
  if (includePathCost) {
    metrics.detours = detourCount(order);
    metrics.distance = pathDistance(order);
  }
  return metrics;
}

/** One policy for route feasibility and monotonic ordering changes. */
export function acceptsRouteMetrics(proposal: RouteMetrics, current: RouteMetrics,
  options: { coverageTradeoff?: boolean } = {}): boolean {
  if (proposal.eastward > current.eastward + (options.coverageTradeoff ? 1 : 0)) return false;
  if (proposal.hardDetours > current.hardDetours && !options.coverageTradeoff) return false;
  if (proposal.hardDetours < current.hardDetours) return true;
  if (options.coverageTradeoff || proposal.detours === undefined || current.detours === undefined) return true;
  return proposal.detours <= current.detours;
}

export function selectionConstraintsAllow(order: Candidate[], config: GeneratorConfig, checkSeparation = true): boolean {
  const separation = checkSeparation ? new SeparationIndex(config.minStopSeparationKm) : undefined;
  const countryCounts = new Map<string, number>();
  const coveredAdmin1 = new Set<string>();
  const coveredOffsets = new Set<number>();
  for (const place of order) {
    if (separation && !separation.allows(place)) return false;
    const unit = admin1UnitFor(place);
    const addsRequiredAdmin1 = unit !== undefined && REQUIRED_ADMIN1_CODES.has(unit) && !coveredAdmin1.has(unit);
    const addsRequiredOffset = !coveredOffsets.has(requiredSnapshotOffset(place));
    if (!countryCapacity(place, countryCounts, config) && !addsRequiredAdmin1 && !addsRequiredOffset) return false;
    separation?.add(place);
    countryCounts.set(place.country, (countryCounts.get(place.country) ?? 0) + 1);
    if (unit) coveredAdmin1.add(unit);
    coveredOffsets.add(requiredSnapshotOffset(place));
  }
  return true;
}

export type RouteAcceptanceOptions = { previous?: Candidate[]; coverageTradeoff?: boolean; requireHardDetourFree?: boolean;
  selectionAlreadyValidated?: boolean };

export function acceptRoutePlan(plan: RoutePlan | undefined, config: GeneratorConfig,
  options: RouteAcceptanceOptions = {}): RoutePlan | undefined {
  if (!plan || (!options.selectionAlreadyValidated && !selectionConstraintsAllow(plan.places, config))) return undefined;
  const hardDetours = hardDetourCount(plan.places);
  if (options.requireHardDetourFree && hardDetours > 0) return undefined;
  if (options.previous && !acceptsRouteMetrics(routeMetrics(plan.places, false), routeMetrics(options.previous, false), options)) return undefined;
  return plan;
}

export function acceptRouteProposal(order: Candidate[], config: GeneratorConfig,
  options: RouteAcceptanceOptions = {}): RoutePlan | undefined {
  return acceptRoutePlan(planTiming(order, config), config, options);
}

export function timingAndDetourAllows(place: Candidate, route: Candidate[], options: { coverageTradeoff?: boolean } = {}): boolean {
  return acceptsRouteMetrics(routeMetrics([...route, place], false), routeMetrics(route, false), options);
}

export function detourCount(order: Candidate[]): number {
  // Local search tracks every geometric detour. hardDetourCount separately
  // exempts singleton-country visits that exist only for mandatory coverage.
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
  let count = 0;
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

type HardDetourRepairOptions = {
  initial: TimedCandidate[];
  config: GeneratorConfig;
  accepts: (order: Candidate[]) => boolean;
};

function sameBandBounds(order: Candidate[], index: number): { start: number; end: number } {
  const offset = requiredSnapshotOffset(order[index]!);
  let start = index;
  let end = index;
  while (start > 0 && requiredSnapshotOffset(order[start - 1]!) === offset) start--;
  while (end < order.length - 1 && requiredSnapshotOffset(order[end + 1]!) === offset) end++;
  return { start, end };
}

type HardDetourSearch = { order: TimedCandidate[]; currentHardDetours: number; currentEastward: number;
  config: GeneratorConfig; accepts: (order: Candidate[]) => boolean; best?: TimedCandidate[]; bestDistance: number };

function considerHardDetourTwoOpt(search: HardDetourSearch, left: number, right: number): void {
  const proposal = moveTwoOpt(search.order, left, right);
  if (!antarcticStopsAtOffsetBandEdge(proposal)) return;
  if (hardDetourCount(proposal) >= search.currentHardDetours || eastwardCount(proposal) > search.currentEastward) return;
  const distance = pathDistance(proposal);
  if (distance >= search.bestDistance || !search.accepts(proposal)) return;
  const plan = acceptRouteProposal(proposal, search.config, { previous: search.order });
  if (!plan) return;
  search.best = plan.places;
  search.bestDistance = distance;
}

function searchHardDetourWindow(search: HardDetourSearch, index: number): void {
  const { start, end } = sameBandBounds(search.order, index);
  for (let left = start; left <= index; left++) {
    for (let right = index; right <= end; right++) {
      if (right - left >= 2) considerHardDetourTwoOpt(search, left, right);
    }
  }
}

function findHardDetourRepair(order: TimedCandidate[], config: GeneratorConfig,
  accepts: (order: Candidate[]) => boolean): TimedCandidate[] | undefined {
  const search: HardDetourSearch = { order, currentHardDetours: hardDetourCount(order),
    currentEastward: eastwardCount(order), config, accepts, bestDistance: Number.POSITIVE_INFINITY };
  for (const index of hardDetourIndexes(order)) searchHardDetourWindow(search, index);
  return search.best;
}

/** Use same-band 2-opt to remove repeated-country detours missed by single-stop moves. */
export function reduceHardDetoursWithinBands({ initial, config, accepts }: HardDetourRepairOptions): TimedCandidate[] {
  let order: TimedCandidate[] = [...initial];
  while (hardDetourCount(order) > 0) {
    const repaired = findHardDetourRepair(order, config, accepts);
    if (!repaired) return order;
    order = repaired;
  }
  return order;
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
    if (!antarcticStopsAtOffsetBandEdge(proposal)) continue;
    if (!reducesBacktracking(proposal, priorEastward, priorDetours)) continue;
    const plan = acceptRouteProposal(proposal, config, { previous: best });
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

export type RouteCost = { distance: number; eastward: number; detours: number; hardDetours?: number };

function routeCost(order: Candidate[]): RouteCost {
  const metrics = routeMetrics(order);
  return { eastward: metrics.eastward, detours: metrics.detours!, hardDetours: metrics.hardDetours, distance: metrics.distance! };
}

function localProposal(order: Candidate[], first: number, second: number, random: () => number): Candidate[] {
  if (random() < 0.5 && first !== second) {
    return moveTwoOpt(order, Math.min(first, second), Math.max(first, second));
  }
  return moveOrOpt(order, first, second);
}

function sameOffsetBand(order: Candidate[], first: number, second: number): boolean {
  const offset = requiredSnapshotOffset(order[first]!);
  if (requiredSnapshotOffset(order[second]!) !== offset) return false;
  const start = Math.min(first, second);
  const end = Math.max(first, second);
  return order.slice(start, end + 1).every((place) => requiredSnapshotOffset(place) === offset);
}

function improvesSweep(cost: RouteCost, current: RouteCost): boolean {
  const hardDetours = cost.hardDetours ?? cost.detours;
  const currentHardDetours = current.hardDetours ?? current.detours;
  if (cost.eastward > current.eastward || hardDetours > currentHardDetours) return false;
  if (hardDetours < currentHardDetours) return true;
  if (cost.detours > current.detours) return false;
  return cost.eastward < current.eastward || cost.detours < current.detours;
}

function improvesPath(cost: RouteCost, current: RouteCost): boolean {
  return cost.distance < current.distance - 0.01;
}

export function canAcceptLocalProposal(cost: RouteCost, current: RouteCost): boolean {
  const hardDetours = cost.hardDetours ?? cost.detours;
  const currentHardDetours = current.hardDetours ?? current.detours;
  const proposalMetrics = { ...cost, hardDetours };
  const currentMetrics = { ...current, hardDetours: currentHardDetours };
  if (!acceptsRouteMetrics(proposalMetrics, currentMetrics)) return false;
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
    if (!antarcticStopsAtOffsetBandEdge(proposal)) continue;
    const cost = routeCost(proposal);
    if (!canAcceptLocalProposal(cost, bestCost)) continue;
    const planned = acceptRouteProposal(proposal, config, { previous: best });
    if (!planned) continue;
    best = planned.places;
    bestCost = cost;
  }
  return best;
}

function isAntarcticStop(place: Candidate): boolean {
  return place.country === 'AQ';
}

function antarcticStopsAtOffsetBandEdge(order: Candidate[]): boolean {
  for (const [index, place] of order.entries()) {
    if (!isAntarcticStop(place)) continue;
    const offset = requiredSnapshotOffset(place);
    const sameBandBefore = order.slice(0, index).some((candidate) =>
      requiredSnapshotOffset(candidate) === offset && !isAntarcticStop(candidate));
    const sameBandAfter = order.slice(index + 1).some((candidate) =>
      requiredSnapshotOffset(candidate) === offset && !isAntarcticStop(candidate));
    if (sameBandBefore && sameBandAfter) return false;
  }
  return true;
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
      // Keep the polar coverage stop at the edge of its band so it cannot
      // divide the adjacent South Pacific island chain into two long legs.
      const polarPriority = Number(isAntarcticStop(left)) - Number(isAntarcticStop(right));
      if (polarPriority !== 0) return polarPriority;
      const latitudeDifference = (left.lat - right.lat) * latitudeDirection;
      if (Math.abs(latitudeDifference) > 0.25) return latitudeDifference;
      const longitudeDifference = right.lng - left.lng;
      if (Math.abs(longitudeDifference) > 0.25) return longitudeDifference;
      return compareStableIds(left.id, right.id);
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

function betterBandProposal(candidate: { prefix: number; detours: number; hardDetours: number; eastward: number; distance: number },
  current: { prefix: number; detours: number; hardDetours: number; eastward: number; distance: number }): boolean {
  if (candidate.prefix !== current.prefix) return candidate.prefix > current.prefix;
  if (candidate.hardDetours !== current.hardDetours) return candidate.hardDetours < current.hardDetours;
  if (candidate.detours !== current.detours) return candidate.detours < current.detours;
  if (candidate.eastward !== current.eastward) return candidate.eastward < current.eastward;
  return candidate.distance < current.distance - 0.01;
}

type BandPathScore = { prefix: number; detours: number; hardDetours: number; eastward: number; distance: number };
type BandPathSearch = { best?: Candidate[]; bestScore: BandPathScore };

function bandPathScore(order: Candidate[], config: GeneratorConfig): BandPathScore {
  return { prefix: timingPrefixLength(order, config), detours: detourCount(order),
    hardDetours: hardDetourCount(order), eastward: eastwardCount(order), distance: pathDistance(order) };
}

type BandProposalOptions = { proposal: Candidate[]; current: BandPathScore; search: BandPathSearch; config: GeneratorConfig };

function considerBandProposal({ proposal, current, search, config }: BandProposalOptions): void {
  if (!antarcticStopsAtOffsetBandEdge(proposal)) return;
  const score = bandPathScore(proposal, config);
  if (score.hardDetours > current.hardDetours || score.eastward > current.eastward) return;
  if (score.hardDetours === current.hardDetours && score.detours > current.detours) return;
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
  while (end < order.length - 1 && sweepBandById.get(order[end + 1]?.id ?? '') === band) end++;
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
  const countryCounts = countryStopCounts(order);
  return order.findIndex((_, index) => isRepeatedCountryDetour(order, index, countryCounts));
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

type DetourRepairContext = { currentCount: number; currentEastward: number; eastwardLimit: number; config: GeneratorConfig;
  accepts: (order: Candidate[]) => boolean };

type TailDetourOptions = DetourRepairContext & { order: Candidate[]; counts: Map<string, number> };

function moveCoverageDetourToTail({ order, counts, ...context }: TailDetourOptions): Candidate[] | undefined {
  for (let index = 1; index < order.length - 1; index++) {
    const via = order[index];
    if (!via || !isRepeatedCountryDetour(order, index, counts)) continue;
    // An isolated required place such as Hawaii can be moved to the route
    // tail, where its North Pole return leg replaces the detour. Any new
    // reversal still has to pass the offset-anomaly timing rule.
    const proposal = [...order.slice(0, index), ...order.slice(index + 1), via];
    const repaired = repairDetourReposition({ proposal, ...context });
    if (repaired) return repaired;
  }
  return undefined;
}

type CoverageDetourOptions = DetourRepairContext & { order: Candidate[] };

function repositionCoverageDetour({ order, ...context }: CoverageDetourOptions): Candidate[] | undefined {
  for (const index of hardDetourIndexes(order)) {
    const proposal = repositionDetourAt({ order, index, ...context });
    if (proposal) return proposal;
  }
  return undefined;
}

function hardDetourIndexes(order: Candidate[]): number[] {
  const counts = countryStopCounts(order);
  return order.map((_, index) => index).filter((index) => isRepeatedCountryDetour(order, index, counts));
}

function repositionTargets(order: Candidate[], index: number): number[] {
  return order.map((_, target) => target).filter((target) => target > 0 && target !== index);
}

function repairDetourReposition({ proposal, currentCount, currentEastward, eastwardLimit, config, accepts }: DetourRepairContext & {
  proposal: Candidate[];
}): Candidate[] | undefined {
  if (!isCandidateDetourRepair(proposal, currentCount)) return undefined;
  const initialPlan = planTiming(proposal, config);
  if (!initialPlan) return undefined;
  const repaired = eastwardCount(initialPlan.places) > currentEastward
    ? reduceEastwardMoves(initialPlan.places, config) : initialPlan.places;
  return isAcceptedDetourRepair(repaired, { currentCount, eastwardLimit, config, accepts }) ? repaired : undefined;
}

function isCandidateDetourRepair(proposal: Candidate[], currentCount: number): boolean {
  return antarcticStopsAtOffsetBandEdge(proposal) && hardDetourCount(proposal) < currentCount;
}

function isAcceptedDetourRepair(repaired: Candidate[], context: Pick<DetourRepairContext, 'currentCount' | 'eastwardLimit' | 'config' | 'accepts'>): boolean {
  return hardDetourCount(repaired) < context.currentCount
    && eastwardCount(repaired) <= context.eastwardLimit
    && hasReasonedTiming(repaired, context.config)
    && context.accepts(repaired);
}

type DetourRepositionOptions = DetourRepairContext & { order: Candidate[]; index: number };

function repositionDetourAt({ order, index, currentCount, currentEastward, eastwardLimit, config, accepts }: DetourRepositionOptions): Candidate[] | undefined {
  for (const target of repositionTargets(order, index)) {
    const proposal = moveOrOpt(order, index, target);
    const repaired = repairDetourReposition({ proposal, currentCount, currentEastward, eastwardLimit, config, accepts });
    if (repaired) return repaired;
  }
  return undefined;
}

function improveOneCoverageDetour(order: Candidate[], config: GeneratorConfig,
  eastwardLimit: number, accepts: (order: Candidate[]) => boolean): Candidate[] | undefined {
  const currentCount = hardDetourCount(order);
  if (currentCount === 0) return undefined;
  const countryCounts = countryStopCounts(order);
  const currentEastward = eastwardCount(order);
  const context = { order, currentCount, currentEastward, eastwardLimit, config, accepts };
  return moveCoverageDetourToTail({ ...context, counts: countryCounts })
    ?? repositionCoverageDetour(context);
}

export function reduceCoverageDetours(initial: Candidate[], config: GeneratorConfig,
  accepts: (order: Candidate[]) => boolean = () => true): Candidate[] {
  let order = [...initial];
  // A required remote coverage stop can need one offset-anomaly reposition;
  // the overall repair may use at most one extra reasoned eastward leg.
  const eastwardLimit = eastwardCount(order) + 1;
  while (true) {
    const improved = improveOneCoverageDetour(order, config, eastwardLimit, accepts);
    if (!improved) return order;
    order = improved;
  }
}

