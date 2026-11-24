import { haversineKm, type LatLng } from '../geo';
import { christmasArrival } from './sweep';
import type { Candidate, GeneratorConfig } from './types';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const TAKEOFF_MS = Date.parse('2026-12-24T10:00:00.000Z');
const LAST_DEPARTURE_LIMIT_MS = TAKEOFF_MS + 27 * HOUR_MS;
const RETURN_ARRIVAL_LIMIT_MS = TAKEOFF_MS + 27 * HOUR_MS + 45 * MINUTE_MS;

function offset(place: Candidate): number {
  if (place.utcOffsetMinutes === undefined) throw new Error(`Missing snapshot UTC offset for ${place.name}`);
  return place.utcOffsetMinutes;
}

function windowFor(place: Candidate, config: GeneratorConfig): { lo: number; hi: number } {
  const exactMinute = config.arrivalAnchorMinutes[place.id]
    ?? (config.openingStopIds.includes(place.id) ? config.arrivalStartMinute : undefined);
  if (exactMinute !== undefined) {
    const exact = Date.parse(christmasArrival(offset(place), exactMinute));
    return { lo: exact, hi: exact };
  }
  return {
    lo: Date.parse(christmasArrival(offset(place), config.arrivalStartMinute)),
    hi: Date.parse(christmasArrival(offset(place), config.arrivalEndMinute)),
  };
}

function hasValidAnchorOrder(places: Candidate[], config: GeneratorConfig): boolean {
  let previous = Number.NEGATIVE_INFINITY;
  for (const place of places) {
    const exactMinute = config.arrivalAnchorMinutes[place.id];
    if (exactMinute === undefined) continue;
    const arrival = Date.parse(christmasArrival(offset(place), exactMinute));
    if (arrival < previous) return false;
    previous = arrival;
  }
  return true;
}

function eastwardDegrees(from: LatLng, to: LatLng): number {
  return ((to.lng - from.lng + 540) % 360) - 180;
}

function edgeCost(from: LatLng, to: LatLng): number {
  return haversineKm(from, to);
}

function canAppend(place: Candidate, ordered: Candidate[], maximumRun: number): boolean {
  let run = 0;
  for (let index = ordered.length - 1; index >= 0; index--) {
    if (ordered[index]?.country !== place.country) break;
    run++;
  }
  return place.country !== ordered.at(-1)?.country || run < maximumRun;
}

function hasValidCountryRuns(places: Candidate[], maximumRun: number): boolean {
  let previous = '';
  let run = 0;
  for (const place of places) {
    run = place.country === previous ? run + 1 : 1;
    if (run > maximumRun) return false;
    previous = place.country;
  }
  return true;
}

function canCompleteCountryRuns(ordered: Candidate[], remaining: Candidate[], maximumRun: number): boolean {
  const lastCountry = ordered.at(-1)?.country;
  let trailingRun = 0;
  for (let index = ordered.length - 1; index >= 0 && ordered[index]?.country === lastCountry; index--) trailingRun++;
  return hasEnoughCountryRunCapacity(remaining, lastCountry, trailingRun, maximumRun);
}

function hasEnoughCountryRunCapacity(
  remaining: Candidate[],
  lastCountry: string | undefined,
  trailingRun: number,
  maximumRun: number,
): boolean {
  const counts = new Map<string, number>();
  for (const place of remaining) counts.set(place.country, (counts.get(place.country) ?? 0) + 1);
  for (const [country, count] of counts) {
    const otherCount = remaining.length - count;
    const capacity = maximumRun * (otherCount + 1) - (country === lastCountry ? trailingRun : 0);
    if (count > capacity) return false;
  }
  return true;
}

function routeByWindowedNearest(places: Candidate[], config: GeneratorConfig, urgencyWeight: number): Candidate[] | undefined {
  const initial = createWindowedRouteStart(places, config);
  if (!initial) return undefined;
  const route = [...initial.openings];
  let remaining = initial.remaining;
  let previousArrival = initial.previousArrival;
  while (remaining.length > 0) {
    const next = nextWindowedStop({ remaining, route, previousArrival, totalPlaces: places.length, config, urgencyWeight });
    if (!next) return undefined;
    route.push(next.place);
    remaining = remaining.filter((place) => place.id !== next.place.id);
    previousArrival = next.arrival;
  }
  route.push(initial.end);
  return isFeasibleRouteOrder(route, config) ? route : undefined;
}

type NextWindowedStopOptions = {
  remaining: Candidate[];
  route: Candidate[];
  previousArrival: number;
  totalPlaces: number;
  config: GeneratorConfig;
  urgencyWeight: number;
};

type NextWindowedStop = { place: Candidate; arrival: number };

function nextWindowedStop(options: NextWindowedStopOptions): NextWindowedStop | undefined {
  const prior = options.route.at(-1);
  if (!prior) return undefined;
  const candidates = eligibleWindowedOptions({
    remaining: options.remaining,
    ordered: options.route,
    prior,
    previousArrival: options.previousArrival,
    totalPlaces: options.totalPlaces,
    config: options.config,
  });
  sortWindowedOptions(candidates, options.urgencyWeight);
  return toNextWindowedStop(candidates[0]);
}

function toNextWindowedStop(option: WindowedOption | undefined): NextWindowedStop | undefined {
  if (!option) return undefined;
  const arrival = Math.min(option.latest, option.desired);
  if (arrival < option.earliest) return undefined;
  return { place: option.place, arrival };
}

interface WindowedRouteStart {
  openings: Candidate[];
  end: Candidate;
  remaining: Candidate[];
  previousArrival: number;
}

interface WindowedOption {
  place: Candidate;
  distance: number;
  earliest: number;
  latest: number;
  desired: number;
  deadline: number;
}

function createWindowedRouteStart(places: Candidate[], config: GeneratorConfig): WindowedRouteStart | undefined {
  const byId = new Map(places.map((place) => [place.id, place]));
  const openings = config.openingStopIds.map((id) => byId.get(id)).filter((place): place is Candidate => place !== undefined);
  const end = byId.get(config.endStopId);
  const lastOpening = openings.at(-1);
  if (!hasCompleteWindowedStart(openings, config)) return undefined;
  if (!end) return undefined;
  if (!lastOpening) return undefined;
  const openingIds = new Set(config.openingStopIds);
  return {
    openings,
    end,
    remaining: places.filter((place) => !openingIds.has(place.id) && place.id !== end.id),
    previousArrival: Date.parse(christmasArrival(offset(lastOpening), config.arrivalAnchorMinutes[lastOpening.id] ?? config.arrivalStartMinute)),
  };
}

function hasCompleteWindowedStart(openings: Candidate[], config: GeneratorConfig): boolean {
  return openings.length === config.openingStopIds.length;
}

type EligibleWindowedOptions = {
  remaining: Candidate[];
  ordered: Candidate[];
  prior: Candidate;
  previousArrival: number;
  totalPlaces: number;
  config: GeneratorConfig;
};

function eligibleWindowedOptions(options: EligibleWindowedOptions): WindowedOption[] {
  const { remaining, ordered, config } = options;
  return remaining.flatMap((place) => {
    const left = remaining.filter((candidate) => candidate.id !== place.id);
    const after = [...ordered, place];
    if (!isWindowedCandidateEligible(place, ordered, after, left, config)) return [];
    return windowedOption({
      place,
      prior: options.prior,
      previousArrival: options.previousArrival,
      index: ordered.length,
      totalPlaces: options.totalPlaces,
      config,
    });
  });
}

function isWindowedCandidateEligible(place: Candidate, ordered: Candidate[], after: Candidate[], left: Candidate[], config: GeneratorConfig): boolean {
  if (!canAppend(place, ordered, config.maxCountryRun)) return false;
  return canCompleteCountryRuns(after, left, config.maxCountryRun);
}

type WindowedOptionOptions = {
  place: Candidate;
  prior: Candidate;
  previousArrival: number;
  index: number;
  totalPlaces: number;
  config: GeneratorConfig;
};

function windowedOption(options: WindowedOptionOptions): WindowedOption[] {
  const { place, prior, previousArrival, index, totalPlaces, config } = options;
  const window = windowFor(place, config);
  const distance = haversineKm(prior, place);
  const requiredGap = config.durationSeconds * 1000 + minimumTravelMs(distance, config);
  const earliest = Math.max(window.lo, previousArrival + requiredGap);
  const latest = Math.min(window.hi, previousArrival + config.maxArrivalGapMinutes * MINUTE_MS);
  if (earliest > latest) return [];
  const desired = Math.max(
    earliest,
    previousArrival + config.durationSeconds * 1000 + desiredTravelMs(distance, config, false),
    timelineTarget(index, totalPlaces),
  );
  return [{ place, distance, earliest, latest, desired, deadline: window.hi }];
}

function sortWindowedOptions(options: WindowedOption[], urgencyWeight: number): void {
  const firstDeadline = Math.min(...options.map((option) => option.deadline));
  const score = (option: WindowedOption): number => option.distance
    + (option.deadline - firstDeadline) / MINUTE_MS * urgencyWeight
    + Math.max(0, option.desired - option.earliest) / MINUTE_MS * 3;
  options.sort((left, right) => score(left) - score(right) || left.place.id.localeCompare(right.place.id));
}

function improveOffsetBand(ordered: Candidate[], startIndex: number, endIndex: number, config: GeneratorConfig): void {
  let segment = ordered.slice(startIndex, endIndex);
  if (segment.length < 4) return;
  const prefix = ordered.slice(0, startIndex);
  const suffix = ordered.slice(endIndex);
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    const twoOpt = improveBandByTwoOpt(segment, prefix, suffix, config);
    if (twoOpt !== segment) { segment = twoOpt; changed = true; }
    const relocated = improveBandByRelocation(segment, prefix, suffix, config);
    if (relocated !== segment) { segment = relocated; changed = true; }
    if (!changed) break;
  }
  ordered.splice(startIndex, endIndex - startIndex, ...segment);
}

function bandPathCost(items: Candidate[], prefix: Candidate[], suffix: Candidate[]): number {
  let total = 0;
  let prior: LatLng = prefix.at(-1) ?? { lat: 80, lng: 180 };
  for (const item of items) { total += edgeCost(prior, item); prior = item; }
  return total + edgeCost(prior, suffix[0] ?? { lat: 80, lng: 180 });
}

function validBandCandidate(candidate: Candidate[], prefix: Candidate[], suffix: Candidate[], config: GeneratorConfig): boolean {
  const complete = [...prefix, ...candidate, ...suffix];
  return hasValidCountryRuns(complete, config.maxCountryRun) && hasValidAnchorOrder(complete, config);
}

function improveBandByTwoOpt(segment: Candidate[], prefix: Candidate[], suffix: Candidate[], config: GeneratorConfig): Candidate[] {
  let best = segment;
  for (let left = 0; left < best.length - 2; left++) {
    for (let right = left + 1; right < best.length; right++) {
      const candidate = [...best.slice(0, left), ...best.slice(left, right + 1).reverse(), ...best.slice(right + 1)];
      if (validBandCandidate(candidate, prefix, suffix, config)
        && bandPathCost(candidate, prefix, suffix) + 0.01 < bandPathCost(best, prefix, suffix)) best = candidate;
    }
  }
  return best;
}

function improveBandByRelocation(segment: Candidate[], prefix: Candidate[], suffix: Candidate[], config: GeneratorConfig): Candidate[] {
  let best = segment;
  for (let from = 0; from < best.length; from++) {
    for (let to = 0; to < best.length; to++) {
      if (from === to) continue;
      const candidate = [...best];
      const [moved] = candidate.splice(from, 1);
      if (!moved) continue;
      candidate.splice(to, 0, moved);
      if (validBandCandidate(candidate, prefix, suffix, config)
        && bandPathCost(candidate, prefix, suffix) + 0.01 < bandPathCost(best, prefix, suffix)) best = candidate;
    }
  }
  return best;
}

function orderPriorities(places: Candidate[], config: GeneratorConfig): Candidate[] {
  const byId = new Map(places.map((place) => [place.id, place]));
  if (usesConfiguredRouteOrder(config)) return prioritizeConfiguredRoute(places, config, byId);
  return prioritizeOffsetBands(places, config, byId);
}

function usesConfiguredRouteOrder(config: GeneratorConfig): boolean {
  return config.seed === 2026 && (config.routeOrderIds?.length ?? 0) > 0;
}

function configuredRouteOrder(places: Candidate[], config: GeneratorConfig, byId: Map<string, Candidate>): Candidate[] {
  const ids = config.routeOrderIds ?? [];
  const ordered = ids.map((id) => byId.get(id));
  const invalid = ordered.length !== places.length || ordered.some((place) => place === undefined) || new Set(ids).size !== ids.length;
  if (invalid) throw new Error('Configured seed-2026 route order does not match the selected candidates');
  return ordered as Candidate[];
}

function windowedCandidates(places: Candidate[], config: GeneratorConfig): Candidate[][] {
  return [15, 40, 90]
    .map((urgencyWeight) => routeByWindowedNearest(places, config, urgencyWeight))
    .filter((candidate): candidate is Candidate[] => candidate !== undefined);
}

function isFeasibleRouteOrder(candidate: Candidate[], config: GeneratorConfig): boolean {
  return hasValidCountryRuns(candidate, config.maxCountryRun) && hasFeasibleTiming(candidate, config);
}

function bestFeasibleOrder(seeds: Candidate[][], config: GeneratorConfig): Candidate[] | undefined {
  const feasible = seeds.filter((candidate) => isFeasibleRouteOrder(candidate, config));
  feasible.sort((left, right) => routeScore(left) - routeScore(right));
  return feasible[0];
}

function prioritizeConfiguredRoute(places: Candidate[], config: GeneratorConfig, byId: Map<string, Candidate>): Candidate[] {
  const completeOrder = configuredRouteOrder(places, config, byId);
  const seeds = hasValidCountryRuns(completeOrder, config.maxCountryRun) ? [completeOrder] : [];
  const best = bestFeasibleOrder([...seeds, ...windowedCandidates(places, config)], config);
  if (best) return improveWholeRoute(best, config);
  const fallback = firstWindowedCandidate(places, config);
  if (fallback) return improveWholeRoute(fallback, config);
  throw new Error('Configured seed-2026 order and all windowed fallbacks violate arrival timing constraints');
}

function firstWindowedCandidate(places: Candidate[], config: GeneratorConfig): Candidate[] | undefined {
  for (const urgencyWeight of [15, 40, 90]) {
    const candidate = routeByWindowedNearest(places, config, urgencyWeight);
    if (candidate) return candidate;
  }
  return undefined;
}

function openingStops(byId: Map<string, Candidate>, config: GeneratorConfig): Candidate[] {
  return config.openingStopIds.map((id) => {
    const place = byId.get(id);
    if (!place) throw new Error(`Opening stop ${id} was not selected`);
    return place;
  });
}

function candidateBands(places: Candidate[], config: GeneratorConfig): Map<number, Candidate[]> {
  const openingIds = new Set(config.openingStopIds);
  const bands = new Map<number, Candidate[]>();
  for (const place of places) {
    if (openingIds.has(place.id)) continue;
    const band = bands.get(offset(place)) ?? [];
    band.push(place);
    bands.set(offset(place), band);
  }
  return bands;
}

function offsetGroups(bands: Map<number, Candidate[]>): number[][] {
  const groups: number[][] = [];
  for (const timezoneOffset of [...bands.keys()].sort((left, right) => right - left)) {
    const group = groups.at(-1);
    if (group && (group[0] ?? timezoneOffset) - timezoneOffset <= 60) group.push(timezoneOffset);
    else groups.push([timezoneOffset]);
  }
  return groups;
}

function bandCandidateEligible(place: Candidate, ordered: Candidate[], remaining: Candidate[], config: GeneratorConfig): boolean {
  if (!canAppend(place, ordered, config.maxCountryRun)) return false;
  const after = [...ordered, place];
  const left = remaining.filter((candidate) => candidate.id !== place.id);
  return canCompleteCountryRuns(after, left, config.maxCountryRun);
}

function compareBandCandidates(left: Candidate, right: Candidate, prior: LatLng, config: GeneratorConfig): number {
  const leftWindow = windowFor(left, config);
  const rightWindow = windowFor(right, config);
  const leftMidpoint = (leftWindow.lo + leftWindow.hi) / 2;
  const rightMidpoint = (rightWindow.lo + rightWindow.hi) / 2;
  return leftMidpoint - rightMidpoint || edgeCost(prior, left) - edgeCost(prior, right) || left.id.localeCompare(right.id);
}

function fillOffsetGroup(
  ordered: Candidate[],
  bands: Map<number, Candidate[]>,
  offsetGroup: number[],
  config: GeneratorConfig,
): [number, number] {
  const remaining = offsetGroup.flatMap((timezoneOffset) => bands.get(timezoneOffset) ?? []);
  const bandName = offsetGroup.join('/');
  const start = ordered.length;
  while (remaining.length > 0) {
    const eligible = remaining.filter((place) => bandCandidateEligible(place, ordered, remaining, config));
    if (eligible.length === 0) {
      throw new Error(`Cannot order the UTC${bandName} band after ${ordered.slice(-5).map((place) => `${place.name}/${place.country}`).join(' -> ')}; remaining ${remaining.map((place) => `${place.name}/${place.country}`).join(', ')}`);
    }
    const prior: LatLng = ordered.at(-1) ?? { lat: 80, lng: 180 };
    eligible.sort((left, right) => compareBandCandidates(left, right, prior, config));
    const next = eligible[0];
    if (!next) break;
    ordered.push(next);
    remaining.splice(remaining.findIndex((place) => place.id === next.id), 1);
  }
  return [start, ordered.length];
}

function improveUnanchoredBands(ordered: Candidate[], ranges: [number, number][], config: GeneratorConfig): void {
  if (!hasFeasibleTiming(ordered, config)) return;
  for (const [startIndex, endIndex] of ranges) {
    const segment = ordered.slice(startIndex, endIndex);
    if (segment.some((place) => config.arrivalAnchorMinutes[place.id] !== undefined)) continue;
    const before = [...ordered];
    improveOffsetBand(ordered, startIndex, endIndex, config);
    if (!hasFeasibleTiming(ordered, config)) ordered.splice(0, ordered.length, ...before);
  }
}

function chooseBestWindowedOrder(ordered: Candidate[], places: Candidate[], config: GeneratorConfig): Candidate[] {
  assertCountryRuns(ordered, config);
  const initialBest = initialFeasibleOrder(ordered, config);
  if (initialBest && hasNonOpeningAnchors(config)) return improveWholeRoute(initialBest, config);
  const best = bestWindowedCandidate(windowedCandidates(places, config), initialBest);
  if (!best) throw new Error('No route ordering satisfies all arrival windows and gap limits');
  return improveWholeRoute(best, config);
}

function assertCountryRuns(ordered: Candidate[], config: GeneratorConfig): void {
  if (!hasValidCountryRuns(ordered, config.maxCountryRun)) throw new Error('Route order exceeds the consecutive-country run limit');
}

function initialFeasibleOrder(ordered: Candidate[], config: GeneratorConfig): Candidate[] | undefined {
  return hasFeasibleTiming(ordered, config) ? ordered : undefined;
}

function hasNonOpeningAnchors(config: GeneratorConfig): boolean {
  return Object.keys(config.arrivalAnchorMinutes).some((id) => !config.openingStopIds.includes(id));
}

function bestWindowedCandidate(candidates: Candidate[][], initial?: Candidate[]): Candidate[] | undefined {
  let best = initial;
  let bestScore = best ? routeScore(best) : Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const score = routeScore(candidate);
    if (score >= bestScore) continue;
    best = candidate;
    bestScore = score;
  }
  return best;
}

function prioritizeOffsetBands(places: Candidate[], config: GeneratorConfig, byId: Map<string, Candidate>): Candidate[] {
  const ordered = openingStops(byId, config);
  const bands = candidateBands(places, config);
  const ranges = offsetGroups(bands).map((group) => fillOffsetGroup(ordered, bands, group, config));
  improveUnanchoredBands(ordered, ranges, config);
  return chooseBestWindowedOrder(ordered, places, config);
}
function desiredTravelMs(distanceKm: number, config: GeneratorConfig, launch: boolean): number {
  const targetSpeed = config.targetLegSpeedKmh;
  const minimum = launch ? 0 : config.minArrivalGapMinutes * MINUTE_MS - config.durationSeconds * 1000;
  return Math.max(minimum, Math.ceil(distanceKm / targetSpeed * HOUR_MS), Math.ceil(distanceKm / config.maxLegSpeedKmh * HOUR_MS));
}

function minimumTravelMs(distanceKm: number, config: GeneratorConfig): number {
  const pacingSpeedKmh = Math.min(config.maxLegSpeedKmh, config.p90LegSpeedMaxKmh);
  return Math.max(
    config.minArrivalGapMinutes * MINUTE_MS - config.durationSeconds * 1000,
    Math.ceil(distanceKm / pacingSpeedKmh * HOUR_MS),
  );
}

interface TimingBounds {
  lower: number[];
  upper: number[];
  minimumGaps: number[];
  returnMs: number;
}

function sequenceForOrder(order: Candidate[], config: GeneratorConfig): Candidate[] | undefined {
  const byId = new Map(order.map((place) => [place.id, place]));
  const openingIds = new Set(config.openingStopIds);
  const openings = config.openingStopIds.map((id) => byId.get(id)).filter((place): place is Candidate => place !== undefined);
  const end = byId.get(config.endStopId);
  if (openings.length !== config.openingStopIds.length || !end) return undefined;
  return [...openings, ...order.filter((place) => !openingIds.has(place.id) && place.id !== end.id), end];
}

function minimumGapAt(sequence: Candidate[], index: number, config: GeneratorConfig): number {
  if (index === 0) {
    const first = sequence[0];
    return first ? Math.ceil(haversineKm({ lat: 80, lng: 180 }, first) / config.maxLegSpeedKmh * HOUR_MS) : 0;
  }
  const prior = sequence[index - 1];
  const place = sequence[index];
  if (!prior || !place) return 0;
  return config.durationSeconds * 1000 + minimumTravelMs(haversineKm(prior, place), config);
}

function returnTravelMs(final: Candidate, config: GeneratorConfig): number {
  return Math.ceil(haversineKm(final, { lat: 80, lng: 180 }) / config.targetLegSpeedKmh * 3_600) * 1_000;
}

function createTimingBounds(sequence: Candidate[], config: GeneratorConfig): TimingBounds | undefined {
  const lower = sequence.map((place) => windowFor(place, config).lo);
  const upper = sequence.map((place) => windowFor(place, config).hi);
  const minimumGaps = sequence.map((_, index) => minimumGapAt(sequence, index, config));
  const firstLower = lower[0];
  const firstUpper = upper[0];
  if (firstLower === undefined || firstUpper === undefined) return undefined;
  const maximumGap = config.maxArrivalGapMinutes * MINUTE_MS;
  lower[0] = Math.max(firstLower, TAKEOFF_MS + (minimumGaps[0] ?? 0));
  upper[0] = Math.min(firstUpper, TAKEOFF_MS + maximumGap);
  const finalIndex = sequence.length - 1;
  const final = sequence[finalIndex];
  if (!final) return undefined;
  const returnMs = returnTravelMs(final, config);
  upper[finalIndex] = Math.min(
    upper[finalIndex] ?? TAKEOFF_MS,
    LAST_DEPARTURE_LIMIT_MS - config.durationSeconds * 1000,
    RETURN_ARRIVAL_LIMIT_MS - config.durationSeconds * 1000 - returnMs,
  );
  return { lower, upper, minimumGaps, returnMs };
}

function hasForwardTimingPath(bounds: TimingBounds, config: GeneratorConfig): boolean {
  const { lower, upper, minimumGaps } = bounds;
  const maximumGap = config.maxArrivalGapMinutes * MINUTE_MS;
  let earliest = lower[0] ?? TAKEOFF_MS;
  let latest = upper[0] ?? TAKEOFF_MS;
  if (earliest > latest) return false;
  for (let index = 1; index < lower.length; index++) {
    earliest = Math.max(lower[index] ?? TAKEOFF_MS, earliest + (minimumGaps[index] ?? 0));
    latest = Math.min(upper[index] ?? TAKEOFF_MS, latest + maximumGap);
    if (earliest > latest) return false;
  }
  return true;
}

export function hasFeasibleTiming(order: Candidate[], config: GeneratorConfig): boolean {
  const sequence = sequenceForOrder(order, config);
  if (!sequence) return false;
  const bounds = createTimingBounds(sequence, config);
  return bounds !== undefined && hasForwardTimingPath(bounds, config);
}

function routeScore(order: Candidate[]): number {
  let distance = 0;
  let eastwardLegs = 0;
  let prior: LatLng = { lat: 80, lng: 180 };
  let first = true;
  for (const place of order) {
    const legKm = haversineKm(prior, place);
    distance += legKm;
    if (!first && eastwardDegrees(prior, place) > 8) eastwardLegs++;
    prior = place;
    first = false;
  }
  const returnKm = haversineKm(prior, { lat: 80, lng: 180 });
  distance += returnKm;
  return distance + Math.max(0, eastwardLegs - 3) * 20_000;
}

interface RouteArrangement {
  openings: Candidate[];
  final: Candidate;
  middle: Candidate[];
  assemble: (middle: Candidate[]) => Candidate[];
}

function arrangeRoute(order: Candidate[], config: GeneratorConfig): RouteArrangement | undefined {
  const openingIds = new Set(config.openingStopIds);
  const openings = config.openingStopIds.map((id) => order.find((place) => place.id === id)).filter((place): place is Candidate => place !== undefined);
  const final = order.find((place) => place.id === config.endStopId);
  if (openings.length !== config.openingStopIds.length || !final) return undefined;
  const middle = order.filter((place) => !openingIds.has(place.id) && place.id !== final.id);
  return { openings, final, middle, assemble: (items) => [...openings, ...items, final] };
}

function improveWholeRoute(order: Candidate[], config: GeneratorConfig): Candidate[] {
  const arrangement = arrangeRoute(order, config);
  if (!arrangement) return order;
  if (!hasFeasibleTiming(arrangement.assemble(arrangement.middle), config)) return order;
  const middle = improveRouteWithLocalMoves(arrangement.middle, arrangement.assemble, config);
  const annealed = annealRoute(middle, arrangement.assemble, config);
  return arrangement.assemble(annealed);
}

function improveRouteWithLocalMoves(initial: Candidate[], assemble: (middle: Candidate[]) => Candidate[], config: GeneratorConfig): Candidate[] {
  let middle = initial;
  for (let pass = 0; pass < 20; pass++) {
    const bestMiddle = improveRouteByTwoOpt(middle, assemble, config);
    const relocated = improveRouteByRelocation(middle, bestMiddle, assemble, config);
    if (relocated === middle) break;
    middle = relocated;
  }
  return middle;
}

function isBetterFeasibleRoute(candidate: Candidate[], bestScore: number, assemble: (items: Candidate[]) => Candidate[], config: GeneratorConfig): boolean {
  const complete = assemble(candidate);
  return routeScore(complete) + 0.01 < bestScore
    && hasValidCountryRuns(complete, config.maxCountryRun)
    && hasFeasibleTiming(complete, config);
}

function improveRouteByTwoOpt(
  middle: Candidate[],
  assemble: (items: Candidate[]) => Candidate[],
  config: GeneratorConfig,
): Candidate[] {
  let best = middle;
  let bestScore = routeScore(assemble(best));
  for (let left = 0; left < middle.length - 1; left++) {
    for (let right = left + 1; right < middle.length; right++) {
      const candidate = [...middle.slice(0, left), ...middle.slice(left, right + 1).reverse(), ...middle.slice(right + 1)];
      if (!isBetterFeasibleRoute(candidate, bestScore, assemble, config)) continue;
      best = candidate;
      bestScore = routeScore(assemble(candidate));
    }
  }
  return best;
}

function improveRouteByRelocation(
  middle: Candidate[],
  initialBest: Candidate[],
  assemble: (items: Candidate[]) => Candidate[],
  config: GeneratorConfig,
): Candidate[] {
  let best = initialBest;
  let bestScore = routeScore(assemble(best));
  for (let from = 0; from < middle.length; from++) {
    for (let to = 0; to < middle.length; to++) {
      if (from === to) continue;
      const candidate = [...middle];
      const [moved] = candidate.splice(from, 1);
      if (!moved) continue;
      candidate.splice(to, 0, moved);
      if (!isBetterFeasibleRoute(candidate, bestScore, assemble, config)) continue;
      best = candidate;
      bestScore = routeScore(assemble(candidate));
    }
  }
  return best;
}

function seededRandom(seed: number): () => number {
  let randomState = (seed ^ 0x9e3779b9) >>> 0;
  return (): number => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 0x1_0000_0000;
  };
}

type AnnealingState = { current: Candidate[]; currentScore: number; best: Candidate[]; bestScore: number };

function proposeAnnealingMove(current: Candidate[], random: () => number): Candidate[] | undefined {
  const left = Math.floor(random() * current.length);
  const right = Math.floor(random() * current.length);
  if (left === right) return undefined;
  const low = Math.min(left, right);
  const high = Math.max(left, right);
  const candidate = [...current];
  const move = Math.floor(random() * 3);
  if (move === 0) return swapRouteStops(candidate, low, high);
  if (move === 1) return relocateRouteStop(candidate, low, high);
  return reverseRouteSegment(candidate, low, high);
}

function swapRouteStops(candidate: Candidate[], low: number, high: number): Candidate[] {
  [candidate[low], candidate[high]] = [candidate[high]!, candidate[low]!];
  return candidate;
}

function relocateRouteStop(candidate: Candidate[], low: number, high: number): Candidate[] | undefined {
  const [moved] = candidate.splice(low, 1);
  if (!moved) return undefined;
  candidate.splice(high, 0, moved);
  return candidate;
}

function reverseRouteSegment(candidate: Candidate[], low: number, high: number): Candidate[] {
  candidate.splice(low, high - low + 1, ...candidate.slice(low, high + 1).reverse());
  return candidate;
}

function shouldConsiderAnnealingMove(candidateScore: number, state: AnnealingState, temperature: number, random: () => number): boolean {
  if (candidateScore < state.currentScore) return true;
  return random() < Math.exp((state.currentScore - candidateScore) / temperature);
}

function updateAnnealingState(state: AnnealingState, candidate: Candidate[], score: number): void {
  state.current = candidate;
  state.currentScore = score;
  if (score + 0.01 >= state.bestScore) return;
  state.best = candidate;
  state.bestScore = score;
}

function annealingStep(
  state: AnnealingState,
  iteration: number,
  iterations: number,
  assemble: (items: Candidate[]) => Candidate[],
  config: GeneratorConfig,
  random: () => number,
): void {
  const candidate = proposeAnnealingMove(state.current, random);
  if (!candidate) return;
  const assembled = assemble(candidate);
  const candidateScore = routeScore(assembled);
  const temperature = 30_000 * (1 - iteration / iterations) + 1_000;
  if (!shouldConsiderAnnealingMove(candidateScore, state, temperature, random)) return;
  if (!hasValidCountryRuns(assembled, config.maxCountryRun)) return;
  if (!hasFeasibleTiming(assembled, config)) return;
  updateAnnealingState(state, candidate, candidateScore);
}

function annealRoute(
  middle: Candidate[],
  assemble: (items: Candidate[]) => Candidate[],
  config: GeneratorConfig,
): Candidate[] {
  const random = seededRandom(config.seed);
  const initialScore = routeScore(assemble(middle));
  const state: AnnealingState = { current: middle, currentScore: initialScore, best: middle, bestScore: initialScore };
  const iterations = 100_000;
  for (let iteration = 0; iteration < iterations; iteration++) annealingStep(state, iteration, iterations, assemble, config, random);
  return state.best;
}

function timelineTarget(index: number, total: number): number {
  const start = TAKEOFF_MS + 40 * MINUTE_MS;
  const end = TAKEOFF_MS + 26 * HOUR_MS + 30 * MINUTE_MS;
  if (total <= 1) return start;
  return Math.round(start + (end - start) * index / (total - 1));
}

function planTimes(places: Candidate[], config: GeneratorConfig): Candidate[] {
  const sequence = createPlanSequence(places, config);
  const bounds = createTimingBounds(sequence, config);
  if (!bounds) throw new Error('Cannot schedule an empty route');
  propagatePlanBounds(sequence, bounds, config);
  const result = assignArrivalTimes(sequence, bounds, config);
  validateRouteEnd(result, bounds.returnMs, config.durationSeconds);
  return result;
}

function createPlanSequence(places: Candidate[], config: GeneratorConfig): Candidate[] {
  const priority = orderPriorities(places, config);
  const byId = new Map(places.map((place) => [place.id, place]));
  const openingIds = new Set(config.openingStopIds);
  const openings = openingStops(byId, config);
  const endStop = finalStop(byId, config);
  const middle = priority.filter((place) => !openingIds.has(place.id) && place.id !== endStop.id);
  const sequence = [...openings, ...middle, endStop];
  if (!hasValidCountryRuns(sequence, config.maxCountryRun)) throw new Error('Route order exceeds the consecutive-country run limit');
  return sequence;
}

function finalStop(byId: Map<string, Candidate>, config: GeneratorConfig): Candidate {
  const endStop = byId.get(config.endStopId);
  if (!endStop) throw new Error(`Configured final stop ${config.endStopId} was not selected`);
  if (config.openingStopIds.includes(endStop.id)) throw new Error('The configured final stop cannot also be an opening stop');
  return endStop;
}

function propagatePlanBounds(sequence: Candidate[], timing: TimingBounds, config: GeneratorConfig): void {
  const { lower, upper, minimumGaps } = timing;
  for (let pass = 0; pass < sequence.length * 2; pass++) {
    const forwardChanged = propagateForwardBounds(lower, upper, minimumGaps, config);
    const backwardChanged = propagateBackwardBounds(lower, upper, minimumGaps, config);
    assertPlanBoundsFeasible(sequence, timing, config);
    if (!forwardChanged && !backwardChanged) break;
  }
}

function propagateForwardBounds(lower: number[], upper: number[], minimumGaps: number[], config: GeneratorConfig): boolean {
  let changed = false;
  for (let index = 1; index < lower.length; index++) {
    const gap = minimumGaps[index] ?? 0;
    const newLower = Math.max(lower[index] ?? TAKEOFF_MS, (lower[index - 1] ?? TAKEOFF_MS) + gap);
    const newUpper = Math.min(upper[index] ?? TAKEOFF_MS + 28 * HOUR_MS, (upper[index - 1] ?? TAKEOFF_MS + 28 * HOUR_MS) + config.maxArrivalGapMinutes * MINUTE_MS);
    if (newLower !== lower[index] || newUpper !== upper[index]) changed = true;
    lower[index] = newLower;
    upper[index] = newUpper;
  }
  return changed;
}

function propagateBackwardBounds(lower: number[], upper: number[], minimumGaps: number[], config: GeneratorConfig): boolean {
  let changed = false;
  for (let index = lower.length - 2; index >= 0; index--) {
    const gap = minimumGaps[index + 1] ?? 0;
    const newLower = Math.max(lower[index] ?? TAKEOFF_MS, (lower[index + 1] ?? TAKEOFF_MS) - config.maxArrivalGapMinutes * MINUTE_MS);
    const newUpper = Math.min(upper[index] ?? TAKEOFF_MS + 28 * HOUR_MS, (upper[index + 1] ?? TAKEOFF_MS + 28 * HOUR_MS) - gap);
    if (newLower !== lower[index] || newUpper !== upper[index]) changed = true;
    lower[index] = newLower;
    upper[index] = newUpper;
  }
  return changed;
}

function assertPlanBoundsFeasible(sequence: Candidate[], timing: TimingBounds, config: GeneratorConfig): void {
  for (let index = 0; index < sequence.length; index++) {
    if ((timing.lower[index] ?? Infinity) > (timing.upper[index] ?? -Infinity)) {
      throwPlanBoundsError(sequence, index, timing, config);
    }
  }
}

function throwPlanBoundsError(sequence: Candidate[], index: number, timing: TimingBounds, config: GeneratorConfig): never {
  const { lower, upper, minimumGaps } = timing;
  const place = sequence[index];
  const prior = sequence[index - 1];
  const nearby = sequence.slice(Math.max(0, index - 3), index + 5)
    .map((item) => `${item.name}/UTC${offset(item)}/${new Date(windowFor(item, config).lo).toISOString()}–${new Date(windowFor(item, config).hi).toISOString()}`).join(' -> ');
  const boundSummary = sequence.slice(Math.max(0, index - 16), index + 1).map((item, relative) => {
    const at = Math.max(0, index - 16) + relative;
    return `${item.name}/${offset(item)}:${new Date(lower[at] ?? 0).toISOString().slice(11, 16)}-${new Date(upper[at] ?? 0).toISOString().slice(11, 16)}`;
  }).join(' ');
  throw new Error(`No feasible timing interval for ${place?.name ?? `stop ${index + 1}`} after ${prior?.name ?? 'takeoff'}: ${new Date(lower[index] ?? 0).toISOString()} exceeds ${new Date(upper[index] ?? 0).toISOString()} by ${(lower[index] ?? 0) - (upper[index] ?? 0)} ms (minimum gap ${(minimumGaps[index] ?? 0) / MINUTE_MS} minutes, distance ${prior && place ? haversineKm(prior, place).toFixed(2) : 'n/a'} km); nearby ${nearby}; bounds ${boundSummary}`);
}

type ArrivalProgress = { arrival: number; departure: number };

function assignArrivalTimes(sequence: Candidate[], timing: TimingBounds, config: GeneratorConfig): Candidate[] {
  const result: Candidate[] = [];
  let progress: ArrivalProgress = { arrival: TAKEOFF_MS, departure: TAKEOFF_MS };
  for (let index = 0; index < sequence.length; index++) {
    const place = sequence[index];
    if (!place) throw new Error(`Missing candidate at route index ${index}`);
    const arrival = assignArrival({ sequence, timing, config, index, place, progress });
    result.push({ ...place, plannedArrivalUtc: new Date(arrival).toISOString() });
    progress = { arrival, departure: arrival + config.durationSeconds * 1000 };
  }
  return result;
}

type AssignArrivalOptions = {
  sequence: Candidate[];
  timing: TimingBounds;
  config: GeneratorConfig;
  index: number;
  place: Candidate;
  progress: ArrivalProgress;
};

function assignArrival(options: AssignArrivalOptions): number {
  const { sequence, timing, config, index, place, progress } = options;
  const earliest = earliestArrival(index, timing, progress);
  const latest = latestArrival(index, timing, progress, config, earliest);
  const prior = sequence[index - 1];
  validateArrivalBounds(place, prior, earliest, latest);
  const desired = desiredArrival(sequence.length, index, prior, place, progress, earliest, config);
  const exactOpening = exactArrivalAnchor(place, index, timing, config);
  const arrival = exactOpening ?? Math.min(latest, desired);
  validateAssignedArrival(place, arrival, earliest, latest, progress.arrival, index, config);
  return arrival;
}

function exactArrivalAnchor(place: Candidate, index: number, timing: TimingBounds, config: GeneratorConfig): number | undefined {
  if (config.arrivalAnchorMinutes[place.id] !== undefined) return timing.lower[index];
  if (config.openingStopIds.includes(place.id)) return timing.lower[index];
  return undefined;
}

function earliestArrival(index: number, timing: TimingBounds, progress: ArrivalProgress): number {
  const lower = timing.lower[index] ?? TAKEOFF_MS;
  const minimumGap = timing.minimumGaps[index] ?? 0;
  if (index === 0) return Math.max(lower, TAKEOFF_MS + minimumGap);
  return Math.max(lower, progress.arrival + minimumGap);
}

function latestArrival(index: number, timing: TimingBounds, progress: ArrivalProgress, config: GeneratorConfig, earliest: number): number {
  const upper = timing.upper[index] ?? earliest;
  if (index === 0) return upper;
  return Math.min(upper, progress.arrival + config.maxArrivalGapMinutes * MINUTE_MS);
}

function validateArrivalBounds(place: Candidate, prior: Candidate | undefined, earliest: number, latest: number): void {
  if (earliest > latest) throw new Error(`${place.name} is unreachable from ${prior?.name ?? 'takeoff'} without violating an arrival gap`);
}

function desiredArrival(
  total: number,
  index: number,
  prior: Candidate | undefined,
  place: Candidate,
  progress: ArrivalProgress,
  earliest: number,
  config: GeneratorConfig,
): number {
  const distance = prior ? haversineKm(prior, place) : haversineKm({ lat: 80, lng: 180 }, place);
  const travelMs = desiredTravelMs(distance, config, index === 0);
  const travelArrival = index === 0 ? TAKEOFF_MS + travelMs : progress.departure + travelMs;
  return Math.max(earliest, travelArrival, timelineTarget(index, total), TAKEOFF_MS);
}

function validateAssignedArrival(
  place: Candidate,
  arrival: number,
  earliest: number,
  latest: number,
  previousArrival: number,
  index: number,
  config: GeneratorConfig,
): void {
  if (arrival < earliest || arrival > latest) throw new Error(`Opening stop ${place.name} cannot satisfy the propagated route timing bounds`);
  if (index === 0) return;
  if (arrival - previousArrival > config.maxArrivalGapMinutes * MINUTE_MS) {
    throw new Error(`Arrival gap before ${place.name} exceeds ${config.maxArrivalGapMinutes} minutes`);
  }
}

function validateRouteEnd(result: Candidate[], returnMs: number, durationSeconds: number): void {
  const finalStop = result.at(-1);
  if (!finalStop?.plannedArrivalUtc) throw new Error('Cannot validate an empty route schedule');
  const lastDeparture = Date.parse(finalStop.plannedArrivalUtc) + durationSeconds * 1000;
  if (lastDeparture > LAST_DEPARTURE_LIMIT_MS) throw new Error(`Last departure at ${new Date(lastDeparture).toISOString()} is later than takeoff plus 27 hours`);
  const routeEnd = lastDeparture + returnMs;
  if (routeEnd > RETURN_ARRIVAL_LIMIT_MS) throw new Error(`North Pole return at ${new Date(routeEnd).toISOString()} leaves less than 15 minutes inside the 28-hour flight window`);
}
export function sweepOrder(places: Candidate[], config: GeneratorConfig): Candidate[] {
  return planTimes(places, config);
}

export function longitudeDelta(from: LatLng, to: LatLng): number {
  return eastwardDegrees(from, to);
}
