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
  const { openings, end, remaining: initialRemaining, previousArrival: initialArrival } = initial;
  let remaining = initialRemaining;
  let previousArrival = initialArrival;
  const finalRoute: Candidate[] = [...openings];

  while (remaining.length > 0) {
    const prior = finalRoute.at(-1);
    if (!prior) return undefined;
    const options = eligibleWindowedOptions(remaining, finalRoute, prior, previousArrival, places.length, config);
    if (options.length === 0) return undefined;
    sortWindowedOptions(options, urgencyWeight);
    const next = options[0];
    if (!next) return undefined;
    const arrival = Math.min(next.latest, next.desired);
    if (arrival < next.earliest) return undefined;
    finalRoute.push(next.place);
    remaining = remaining.filter((place) => place.id !== next.place.id);
    previousArrival = arrival;
  }

  finalRoute.push(end);
  return hasValidCountryRuns(finalRoute, config.maxCountryRun) && hasFeasibleTiming(finalRoute, config)
    ? finalRoute
    : undefined;
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
  if (openings.length !== config.openingStopIds.length || !end || !lastOpening) return undefined;
  const openingIds = new Set(config.openingStopIds);
  return {
    openings,
    end,
    remaining: places.filter((place) => !openingIds.has(place.id) && place.id !== end.id),
    previousArrival: Date.parse(christmasArrival(offset(lastOpening), config.arrivalAnchorMinutes[lastOpening.id] ?? config.arrivalStartMinute)),
  };
}

function eligibleWindowedOptions(
  remaining: Candidate[],
  ordered: Candidate[],
  prior: Candidate,
  previousArrival: number,
  totalPlaces: number,
  config: GeneratorConfig,
): WindowedOption[] {
  return remaining.flatMap((place) => {
    const left = remaining.filter((candidate) => candidate.id !== place.id);
    const after = [...ordered, place];
    if (!canAppend(place, ordered, config.maxCountryRun)
      || !canCompleteCountryRuns(after, left, config.maxCountryRun)) return [];
    return windowedOption(place, prior, previousArrival, ordered.length, totalPlaces, config);
  });
}

function windowedOption(
  place: Candidate,
  prior: Candidate,
  previousArrival: number,
  index: number,
  totalPlaces: number,
  config: GeneratorConfig,
): WindowedOption[] {
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
  if (config.seed === 2026 && config.routeOrderIds?.length) {
    const routeOrder = config.routeOrderIds.map((id) => byId.get(id));
    if (routeOrder.length !== places.length || routeOrder.some((place) => !place)
      || new Set(config.routeOrderIds).size !== config.routeOrderIds.length) {
      throw new Error('Configured seed-2026 route order does not match the selected candidates');
    }
    const completeOrder = routeOrder as Candidate[];
    const seeds = [...(hasValidCountryRuns(completeOrder, config.maxCountryRun) ? [completeOrder] : []), ...[15, 40, 90]
      .map((urgencyWeight) => routeByWindowedNearest(places, config, urgencyWeight))
      .filter((candidate): candidate is Candidate[] => candidate !== undefined)];
    const feasibleSeeds = seeds.filter((candidate) => hasFeasibleTiming(candidate, config)
      && hasValidCountryRuns(candidate, config.maxCountryRun));
    feasibleSeeds.sort((left, right) => routeScore(left) - routeScore(right));
    const bestSeed = feasibleSeeds[0];
    if (bestSeed) return improveWholeRoute(bestSeed, config);
    for (const urgencyWeight of [15, 40, 90]) {
      const fallback = routeByWindowedNearest(places, config, urgencyWeight);
      if (fallback) return improveWholeRoute(fallback, config);
    }
    throw new Error('Configured seed-2026 order and all windowed fallbacks violate arrival timing constraints');
  }
  const ordered: Candidate[] = [];
  for (const id of config.openingStopIds) {
    const place = byId.get(id);
    if (!place) throw new Error(`Opening stop ${id} was not selected`);
    ordered.push(place);
    byId.delete(id);
  }
  const bands = new Map<number, Candidate[]>();
  for (const place of byId.values()) {
    const band = bands.get(offset(place)) ?? [];
    band.push(place);
    bands.set(offset(place), band);
  }
  const offsetGroups: number[][] = [];
  const bandRanges: [number, number][] = [];
  for (const timezoneOffset of [...bands.keys()].sort((left, right) => right - left)) {
    const group = offsetGroups.at(-1);
    if (group && (group[0] ?? timezoneOffset) - timezoneOffset <= 60) group.push(timezoneOffset);
    else offsetGroups.push([timezoneOffset]);
  }
  for (const offsetGroup of offsetGroups) {
    const remaining = offsetGroup.flatMap((timezoneOffset) => bands.get(timezoneOffset) ?? []);
    const bandName = offsetGroup.join('/');
    const segmentStart = ordered.length;
    while (remaining.length > 0) {
      const eligible = remaining.filter((place) => {
        if (!canAppend(place, ordered, config.maxCountryRun)) return false;
        const after = [...ordered, place];
        return canCompleteCountryRuns(after, remaining.filter((candidate) => candidate.id !== place.id), config.maxCountryRun);
      });
      if (eligible.length === 0) {
        throw new Error(`Cannot order the UTC${bandName} band after ${ordered.slice(-5).map((place) => `${place.name}/${place.country}`).join(' -> ')}; remaining ${remaining.map((place) => `${place.name}/${place.country}`).join(', ')}`);
      }
      const prior: LatLng = ordered.at(-1) ?? { lat: 80, lng: 180 };
      eligible.sort((left, right) => {
        const leftWindow = windowFor(left, config);
        const rightWindow = windowFor(right, config);
        const leftMidpoint = (leftWindow.lo + leftWindow.hi) / 2;
        const rightMidpoint = (rightWindow.lo + rightWindow.hi) / 2;
        return leftMidpoint - rightMidpoint || edgeCost(prior, left) - edgeCost(prior, right) || left.id.localeCompare(right.id);
      });
      const next = eligible[0];
      if (!next) break;
      ordered.push(next);
      remaining.splice(remaining.findIndex((place) => place.id === next.id), 1);
    }
    bandRanges.push([segmentStart, ordered.length]);
  }
  if (hasFeasibleTiming(ordered, config)) {
    for (const [startIndex, endIndex] of bandRanges) {
      const segment = ordered.slice(startIndex, endIndex);
      if (segment.some((place) => config.arrivalAnchorMinutes[place.id] !== undefined)) continue;
      const before = [...ordered];
      improveOffsetBand(ordered, startIndex, endIndex, config);
      if (!hasFeasibleTiming(ordered, config)) ordered.splice(0, ordered.length, ...before);
    }
  }
  if (!hasValidCountryRuns(ordered, config.maxCountryRun)) throw new Error('Route order exceeds the consecutive-country run limit');
  let best: Candidate[] | undefined = hasFeasibleTiming(ordered, config) ? ordered : undefined;
  let bestScore = best ? routeScore(best) : Number.POSITIVE_INFINITY;
  const hasAdditionalAnchors = Object.keys(config.arrivalAnchorMinutes).some((id) => !config.openingStopIds.includes(id));
  if (best && hasAdditionalAnchors) return improveWholeRoute(best, config);
  for (const urgencyWeight of [15, 40, 90]) {
    const candidate = routeByWindowedNearest(places, config, urgencyWeight);
    if (!candidate) continue;
    const score = routeScore(candidate);
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  if (!best) throw new Error('No route ordering satisfies all arrival windows and gap limits');
  return improveWholeRoute(best, config);
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
  if (!arrangement || !hasFeasibleTiming(arrangement.assemble(arrangement.middle), config)) return order;
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

function annealRoute(
  middle: Candidate[],
  assemble: (items: Candidate[]) => Candidate[],
  config: GeneratorConfig,
): Candidate[] {
  const random = seededRandom(config.seed);
  let current = middle;
  let currentScore = routeScore(assemble(current));
  let best = current;
  let bestScore = currentScore;
  const iterations = 100_000;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const left = Math.floor(random() * current.length);
    const right = Math.floor(random() * current.length);
    if (left === right) continue;
    const low = Math.min(left, right);
    const high = Math.max(left, right);
    const candidate = [...current];
    const move = Math.floor(random() * 3);
    if (move === 0) {
      [candidate[low], candidate[high]] = [candidate[high]!, candidate[low]!];
    } else if (move === 1) {
      const [moved] = candidate.splice(low, 1);
      if (!moved) continue;
      candidate.splice(high, 0, moved);
    } else {
      candidate.splice(low, high - low + 1, ...candidate.slice(low, high + 1).reverse());
    }
    const assembled = assemble(candidate);
    const candidateScore = routeScore(assembled);
    const temperature = 30_000 * (1 - iteration / iterations) + 1_000;
    const shouldConsider = candidateScore < currentScore
      || random() < Math.exp((currentScore - candidateScore) / temperature);
    if (!shouldConsider || !hasValidCountryRuns(assembled, config.maxCountryRun) || !hasFeasibleTiming(assembled, config)) continue;
    current = candidate;
    currentScore = candidateScore;
    if (candidateScore + 0.01 < bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }
  return best;
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
  const openings = config.openingStopIds.map((id) => {
    const place = byId.get(id);
    if (!place) throw new Error(`Opening stop ${id} was not selected`);
    return place;
  });
  const endStop = byId.get(config.endStopId);
  if (!endStop) throw new Error(`Configured final stop ${config.endStopId} was not selected`);
  if (openingIds.has(config.endStopId)) throw new Error('The configured final stop cannot also be an opening stop');
  const sequence = [
    ...openings,
    ...priority.filter((place) => !openingIds.has(place.id) && place.id !== endStop.id),
    endStop,
  ];
  if (!hasValidCountryRuns(sequence, config.maxCountryRun)) throw new Error('Route order exceeds the consecutive-country run limit');
  return sequence;
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

function assignArrivalTimes(sequence: Candidate[], timing: TimingBounds, config: GeneratorConfig): Candidate[] {
  const { lower, upper, minimumGaps } = timing;
  const openingIds = new Set(config.openingStopIds);
  const result: Candidate[] = [];
  let previousArrival = TAKEOFF_MS;
  let previousDeparture = TAKEOFF_MS;
  for (let index = 0; index < sequence.length; index++) {
    const place = sequence[index];
    if (!place) throw new Error(`Missing candidate at route index ${index}`);
    const exactOpening = config.arrivalAnchorMinutes[place.id] !== undefined
      ? lower[index]
      : openingIds.has(place.id) ? lower[index] : undefined;
    const prior = sequence[index - 1];
    const distance = prior ? haversineKm(prior, place) : haversineKm({ lat: 80, lng: 180 }, place);
    const earliest = index === 0
      ? Math.max(lower[index] ?? TAKEOFF_MS, TAKEOFF_MS + (minimumGaps[index] ?? 0))
      : Math.max(lower[index] ?? TAKEOFF_MS, previousArrival + (minimumGaps[index] ?? 0));
    const latest = index === 0
      ? upper[index] ?? earliest
      : Math.min(upper[index] ?? earliest, previousArrival + config.maxArrivalGapMinutes * MINUTE_MS);
    if (earliest > latest) throw new Error(`${place.name} is unreachable from ${prior?.name ?? 'takeoff'} without violating an arrival gap`);
    const desired = Math.max(
      earliest,
      index === 0 ? TAKEOFF_MS + desiredTravelMs(distance, config, true) : previousDeparture + desiredTravelMs(distance, config, false),
      timelineTarget(index, sequence.length),
      TAKEOFF_MS,
    );
    const arrival = exactOpening ?? Math.min(latest, desired);
    if (arrival < earliest || arrival > latest) throw new Error(`Opening stop ${place.name} cannot satisfy the propagated route timing bounds`);
    if (index > 0 && arrival - previousArrival > config.maxArrivalGapMinutes * MINUTE_MS) throw new Error(`Arrival gap before ${place.name} exceeds ${config.maxArrivalGapMinutes} minutes`);
    result.push({ ...place, plannedArrivalUtc: new Date(arrival).toISOString() });
    previousArrival = arrival;
    previousDeparture = arrival + config.durationSeconds * 1000;
  }
  return result;
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
