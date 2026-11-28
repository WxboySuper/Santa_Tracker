import { haversineKm } from '../geo';
import { admin1UnitFor } from './admin1';
import { classifyRegion } from './regions';
import { scheduledTravelMilliseconds, seededRandom, REQUIRED_ADMIN1_CODES, SeparationIndex, type TimedCandidate } from './order-shared';
import { detourRatio, localWindowPenaltyMinutes, localWindowStatus, longitudeDelta,
  stopDurationSeconds, stopTier } from './sweep';
import { DEFAULT_GENERATOR_LIMITS, NORTH_POLE, RETURN_DEADLINE_UTC, TAKEOFF_UTC, type Candidate, type GeneratorConfig } from './types';

const MAX_STOPS = 700;
const MIN_STOPS = 550;
const MINUTES_PER_MS = 1 / 60_000;
const BUDGET_END = Date.parse(RETURN_DEADLINE_UTC);
const IMPROVEMENT_EPSILON = 0.01;
const MAX_TOUR_IMPROVEMENT_ROUNDS = 100;
const MAX_COUNTRY_STOPS = Math.floor(550 * 0.12);
const MAX_US_CA_STOPS = Math.floor(550 * 0.20);
// Soft total-stop targets allocate more of the optional budget to larger
// populations. Countries outside this list keep one representative plus one
// optional stop by default; the hard country share cap still applies.
const DEFAULT_COUNTRY_DEPTH_TARGET = 2;
const COUNTRY_DEPTH_TARGETS: Record<string, number> = {
  US: 66, CA: 33, AU: 16, CN: 24, IN: 24, ID: 18, NG: 18, BR: 18, PK: 18, BD: 18,
  MX: 18, JP: 18, DE: 18, FR: 17, GB: 16, RU: 16, ES: 16, IT: 16,
  TR: 15, PH: 16, VN: 16, TH: 15, AR: 14, CO: 14, EG: 14, KR: 14, IR: 14, ZA: 14,
  UA: 13, PL: 13, MY: 13, ET: 12, KE: 12, AF: 8, CU: 7, JM: 5, SV: 5,
};

type Timing = { places: TimedCandidate[]; arrivals: number[]; departures: number[]; waits: number[]; returnArrival: number; greenCount: number };
type Insertion = { index: number; cost: number; extraMs: number; arrival: number };
type InsertionImpact = { returnDelayMs: number; greenCount: number };
type RankedInsertion = { place: Candidate; insertion: Insertion; rank: number };
type MandatorySelection = {
  chosen: Candidate[];
  separation: SeparationIndex;
  selected: Set<string>;
  missing: string[];
};
type TourProposal = { places: Candidate[]; score: number };
type NearestNeighborChoice = { index: number; place: Candidate; score: number };
type NearestNeighborSearchOptions = {
  remaining: Candidate[];
  currentRank: number;
  previous: Candidate | typeof NORTH_POLE;
  previousDeparture: number;
  config: GeneratorConfig;
};
type OptionalSelection = {
  route: Candidate[];
  selectedIds: Set<string>;
  countryCounts: Map<string, number>;
  separation: SeparationIndex;
  pending: Candidate[];
  random: () => number;
};
type InsertionOptions = {
  order: Candidate[];
  place: Candidate;
  index: number;
  plan: Timing;
  config: GeneratorConfig;
};
type InsertionSearchOptions = {
  order: Candidate[];
  place: Candidate;
  countryCounts: Map<string, number>;
  plan: Timing;
  config: GeneratorConfig;
  random: () => number;
};

function localMidnightRank(place: Candidate): number {
  return -(place.utcOffsetMinutes ?? 0);
}

function isCapitalPlace(place: Candidate): boolean {
  if (place.isNationalCapital) return true;
  if (place.isCapital) return true;
  if (place.capital) return true;
  return place.category === 'capital';
}

function candidatePriority(place: Candidate): number {
  const population = place.population ?? 0;
  return Number(isCapitalPlace(place)) * 1_000_000
    + Number(place.headlineLandmark) * 500_000 + Math.min(population, 400_000);
}

function candidatesByPriority(places: Candidate[]): Candidate[] {
  return [...places].sort((a, b) => candidatePriority(b) - candidatePriority(a)
    || localMidnightRank(a) - localMidnightRank(b) || a.id.localeCompare(b.id));
}

function countryRepresentativeCandidates(country: string, candidates: Candidate[]): Candidate[] {
  const peninsulaCandidates = country === 'AQ'
    ? candidates.filter((place) => place.utcOffsetMinutes === -180)
    : [];
  return candidatesByPriority(peninsulaCandidates.length ? peninsulaCandidates : candidates);
}

function emptyMandatorySelection(minimumSeparationKm: number): MandatorySelection {
  return {
    chosen: [],
    separation: new SeparationIndex({ minimumKm: minimumSeparationKm }),
    selected: new Set<string>(),
    missing: [],
  };
}

function admin1CandidatesByUnit(pool: Candidate[]): Map<string, Candidate[]> {
  const units = new Map<string, Candidate[]>();
  for (const place of pool) {
    const unit = admin1UnitFor(place);
    if (!unit) continue;
    if (!REQUIRED_ADMIN1_CODES.has(unit)) continue;
    units.set(unit, [...(units.get(unit) ?? []), place]);
  }
  return units;
}

function maxMidnightRank(places: Candidate[]): number {
  return Math.max(...places.map(localMidnightRank), Number.NEGATIVE_INFINITY);
}

function orderedAdmin1Units(units: Map<string, Candidate[]>): string[] {
  return [...REQUIRED_ADMIN1_CODES].sort((a, b) => {
    const offsetA = maxMidnightRank(units.get(a) ?? []);
    const offsetB = maxMidnightRank(units.get(b) ?? []);
    return offsetA - offsetB || a.localeCompare(b);
  });
}

function recordMandatoryPlace(place: Candidate, selection: MandatorySelection): void {
  selection.chosen.push(place);
  selection.selected.add(place.id);
  selection.separation.add(place);
}

function addAdmin1Unit(unit: string, candidates: Candidate[], minimumSeparationKm: number,
  selection: MandatorySelection): void {
  const place = candidatesByPriority(candidates).find((candidate) => selection.separation.allows(candidate));
  if (!place) {
    selection.missing.push(`${unit}: no candidate at least ${minimumSeparationKm} km from the mandatory stops`);
    return;
  }
  recordMandatoryPlace(place, selection);
}

function addMandatoryAdmin1(pool: Candidate[], minimumSeparationKm: number, selection: MandatorySelection): void {
  const units = admin1CandidatesByUnit(pool);
  for (const unit of orderedAdmin1Units(units)) {
    addAdmin1Unit(unit, units.get(unit) ?? [], minimumSeparationKm, selection);
  }
}

function countryCandidatesByCode(pool: Candidate[]): Map<string, Candidate[]> {
  const countries = new Map<string, Candidate[]>();
  for (const place of pool) {
    if (!countries.has(place.country)) countries.set(place.country, []);
    countries.get(place.country)?.push(place);
  }
  return countries;
}

function orderedCountries(countryCandidates: Map<string, Candidate[]>): string[] {
  return [...countryCandidates.keys()].sort((a, b) => (countryCandidates.get(a)?.length ?? 0) - (countryCandidates.get(b)?.length ?? 0)
    || a.localeCompare(b));
}

function isEligibleMandatoryCandidate(candidate: Candidate, selection: MandatorySelection): boolean {
  if (selection.selected.has(candidate.id)) return false;
  return selection.separation.allows(candidate);
}

function nearestSelectedStop(candidates: Candidate[], chosen: Candidate[]): { candidate: Candidate; selectedPlace: Candidate; km: number } | undefined {
  return candidates
    .flatMap((candidate) => chosen.map((selectedPlace) => ({ candidate, selectedPlace, km: haversineKm(candidate, selectedPlace) })))
    .sort((a, b) => a.km - b.km || a.candidate.id.localeCompare(b.candidate.id))[0];
}

function countryCoverageFailure(country: string, candidates: Candidate[], minimumSeparationKm: number,
  chosen: Candidate[]): string {
  const nearest = nearestSelectedStop(candidatesByPriority(candidates), chosen);
  if (!nearest) return `${country}: no country representative at least ${minimumSeparationKm} km from mandatory stops`;
  return `${country}: no representative at least ${minimumSeparationKm} km from mandatory stops; closest ${nearest.candidate.name} is ${nearest.km.toFixed(1)} km from ${nearest.selectedPlace.name} (${nearest.selectedPlace.country})`;
}

function distanceToNearestMandatory(candidate: Candidate, chosen: Candidate[]): number {
  if (chosen.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...chosen.map((place) => haversineKm(candidate, place)));
}

function spacingExceptionCandidate(country: string, candidates: Candidate[], selection: MandatorySelection): Candidate | undefined {
  let best: Candidate | undefined;
  let bestDistance = Number.NEGATIVE_INFINITY;
  for (const candidate of countryRepresentativeCandidates(country, candidates)) {
    if (selection.selected.has(candidate.id)) continue;
    const distance = distanceToNearestMandatory(candidate, selection.chosen);
    if (distance <= bestDistance) continue;
    best = candidate;
    bestDistance = distance;
  }
  return best ? { ...best, mandatoryCoverageSpacingException: true } : undefined;
}

function addCountryRepresentative(country: string, candidates: Candidate[], minimumSeparationKm: number,
  selection: MandatorySelection): void {
  const sortedCandidates = countryRepresentativeCandidates(country, candidates);
  const place = sortedCandidates.find((candidate) => isEligibleMandatoryCandidate(candidate, selection));
  if (!place) {
    const spacingException = spacingExceptionCandidate(country, sortedCandidates, selection);
    if (!spacingException) {
      selection.missing.push(countryCoverageFailure(country, candidates, minimumSeparationKm, selection.chosen));
      return;
    }
    recordMandatoryPlace(spacingException, selection);
    return;
  }
  recordMandatoryPlace(place, selection);
}

function addMandatoryCountries(pool: Candidate[], minimumSeparationKm: number, selection: MandatorySelection): void {
  const countryCandidates = countryCandidatesByCode(pool);
  const represented = new Set(selection.chosen.map((place) => place.country));
  for (const country of orderedCountries(countryCandidates)) {
    if (represented.has(country)) continue;
    addCountryRepresentative(country, countryCandidates.get(country) ?? [], minimumSeparationKm, selection);
    const chosen = selection.chosen.at(-1);
    if (chosen?.country === country) represented.add(country);
  }
}

function mandatoryTour(pool: Candidate[], minimumSeparationKm: number): { places: Candidate[]; missing: string[] } {
  const selection = emptyMandatorySelection(minimumSeparationKm);
  addMandatoryAdmin1(pool, minimumSeparationKm, selection);
  addMandatoryCountries(pool, minimumSeparationKm, selection);
  const places = selection.chosen.sort((a, b) => localMidnightRank(a) - localMidnightRank(b) || a.id.localeCompare(b.id));
  return { places, missing: selection.missing };
}

function timing(order: Candidate[], config: GeneratorConfig): Timing | undefined {
  let prior: Candidate | typeof NORTH_POLE = NORTH_POLE;
  let priorDeparture = Date.parse(TAKEOFF_UTC);
  const places: TimedCandidate[] = [];
  const arrivals: number[] = [];
  const departures: number[] = [];
  const waits: number[] = [];
  let greenCount = 0;
  for (const place of order) {
    const earliest = priorDeparture + scheduledTravelMilliseconds(prior, place, config);
    const scheduled = scheduledLocalArrival(place, earliest);
    if (!scheduled) return undefined;
    const { arrival, waitMs } = scheduled;
    const status = localWindowStatus({ instant: arrival, offsetMinutes: place.utcOffsetMinutes ?? 0 });
    if (status === 'GREEN') greenCount++;
    const tier = stopTier(place);
    const durationSeconds = stopDurationSeconds(tier);
    const departure = arrival + durationSeconds * 1000;
    places.push({ ...place, plannedArrivalUtc: new Date(arrival).toISOString(), plannedStopTier: tier, plannedStopDurationSeconds: durationSeconds });
    arrivals.push(arrival);
    departures.push(departure);
    waits.push(waitMs);
    prior = place;
    priorDeparture = departure;
  }
  const last = places.at(-1);
  if (!last) return undefined;
  const returnArrival = priorDeparture + scheduledTravelMilliseconds(last, NORTH_POLE, config);
  return { places, arrivals, departures, waits, returnArrival, greenCount };
}

function isInsideHardWindow(place: Candidate, arrival: number): boolean {
  return localWindowStatus({ instant: arrival, offsetMinutes: place.utcOffsetMinutes ?? 0 }) !== 'RED';
}

function localArrivalPenalty(place: Candidate, arrival: number): number {
  if (!isInsideHardWindow(place, arrival)) return Number.POSITIVE_INFINITY;
  return localWindowPenaltyMinutes({ instant: arrival, offsetMinutes: place.utcOffsetMinutes ?? 0 }) * 0.1;
}

function scheduledLocalArrival(place: Candidate, earliest: number): { arrival: number; waitMs: number } | undefined {
  const offset = place.utcOffsetMinutes ?? 0;
  const status = localWindowStatus({ instant: earliest, offsetMinutes: offset });
  if (status !== 'RED') return { arrival: earliest, waitMs: 0 };
  const local = new Date(earliest + offset * 60_000);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minute <= 5 * 60 + 30 || minute >= 22 * 60 + 30) return undefined;
  const opening = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23) - offset * 60_000;
  if (opening < earliest) return undefined;
  return { arrival: opening, waitMs: opening - earliest };
}

function directionPenalty(from: Candidate | typeof NORTH_POLE, to: Candidate | typeof NORTH_POLE, config: GeneratorConfig): number {
  const eastwardDegrees = longitudeDelta(from, to);
  if (eastwardDegrees <= 1) return 0;
  const meanLatitude = (from.lat + to.lat) / 2;
  const clockMinutesLost = eastwardDegrees * 4 * Math.max(0.15, Math.cos(meanLatitude * Math.PI / 180));
  const travelMinutes = scheduledTravelMilliseconds(from, to, config) * MINUTES_PER_MS;
  return Math.min(Math.max(0, clockMinutesLost - travelMinutes) * 0.05, travelMinutes * 0.25);
}

function regionCrossingPenalty(from: Candidate | typeof NORTH_POLE, to: Candidate | typeof NORTH_POLE, distanceKm: number): number {
  if (!('country' in from)) return 0;
  if (!('country' in to)) return 0;
  if (distanceKm < 3_500) return 0;
  const origin = classifyRegion(from);
  const destination = classifyRegion(to);
  if (origin.continent === destination.continent) return 0;
  return Math.min(8, distanceKm / 2_500);
}

function legCost(from: Candidate | typeof NORTH_POLE, to: Candidate | typeof NORTH_POLE, config: GeneratorConfig): number {
  const distance = haversineKm(from, to);
  const travelMinutes = scheduledTravelMilliseconds(from, to, config) * MINUTES_PER_MS;
  return travelMinutes + directionPenalty(from, to, config) + regionCrossingPenalty(from, to, distance);
}

function detourPenalty(from: Candidate | typeof NORTH_POLE, via: Candidate, to: Candidate | typeof NORTH_POLE): number {
  const ratio = detourRatio(from, via, to);
  return Math.min(8, Math.max(0, ratio - 1.5) * 4);
}

function nearestNeighborScore(place: Candidate, previous: Candidate | typeof NORTH_POLE, previousDeparture: number,
  config: GeneratorConfig): number {
  const earliest = previousDeparture + scheduledTravelMilliseconds(previous, place, config);
  const scheduled = scheduledLocalArrival(place, earliest);
  if (!scheduled) return Number.POSITIVE_INFINITY;
  const waitMinutes = scheduled.waitMs * MINUTES_PER_MS;
  return legCost(previous, place, config) + waitMinutes + localArrivalPenalty(place, scheduled.arrival);
}

function isBetterNearestNeighbor(place: Candidate, score: number, bestPlace: Candidate | undefined, bestScore: number): boolean {
  if (score < bestScore) return true;
  if (score > bestScore) return false;
  if (!bestPlace) return true;
  return place.id.localeCompare(bestPlace.id) < 0;
}

function findBestNearestNeighbor({ remaining, currentRank, previous, previousDeparture, config }: NearestNeighborSearchOptions): NearestNeighborChoice | undefined {
  let best: NearestNeighborChoice | undefined;
  for (const [index, place] of remaining.entries()) {
    if (localMidnightRank(place) !== currentRank) continue;
    const score = nearestNeighborScore(place, previous, previousDeparture, config);
    if (!Number.isFinite(score)) continue;
    if (!isBetterNearestNeighbor(place, score, best?.place, best?.score ?? Number.POSITIVE_INFINITY)) continue;
    best = { index, place, score };
  }
  return best;
}

function appendRemainingByMidnightRank(order: Candidate[], remaining: Candidate[]): void {
  order.push(...remaining.sort((a, b) => localMidnightRank(a) - localMidnightRank(b) || a.id.localeCompare(b.id)));
}

function midnightBiasedNearestNeighbor(seed: Candidate[], config: GeneratorConfig): Candidate[] {
  const remaining = [...seed];
  const order: Candidate[] = [];
  let previous: Candidate | typeof NORTH_POLE = NORTH_POLE;
  let previousDeparture = Date.parse(TAKEOFF_UTC);
  while (remaining.length > 0) {
    const currentRank = Math.min(...remaining.map(localMidnightRank));
    const best = findBestNearestNeighbor({ remaining, currentRank, previous, previousDeparture, config });
    if (!best) {
      appendRemainingByMidnightRank(order, remaining);
      break;
    }
    const [next] = remaining.splice(best.index, 1);
    if (!next) break;
    const earliest = previousDeparture + scheduledTravelMilliseconds(previous, next, config);
    const scheduled = scheduledLocalArrival(next, earliest);
    if (!scheduled) break;
    previousDeparture = scheduled.arrival + stopDurationSeconds(stopTier(next)) * 1000;
    order.push(next);
    previous = next;
  }
  return order;
}

function travelMinutes(from: Candidate | typeof NORTH_POLE, to: Candidate | typeof NORTH_POLE,
  config: GeneratorConfig): number {
  return scheduledTravelMilliseconds(from, to, config) * MINUTES_PER_MS;
}

function tourTravelMinutes(order: Candidate[], config: GeneratorConfig): number {
  let total = travelMinutes(NORTH_POLE, order[0] ?? NORTH_POLE, config);
  for (let index = 1; index < order.length; index++) {
    total += travelMinutes(order[index - 1]!, order[index]!, config);
  }
  return total + travelMinutes(order.at(-1) ?? NORTH_POLE, NORTH_POLE, config);
}

function reversalTravelDelta(current: Candidate[], start: number, end: number, config: GeneratorConfig): number {
  const before = current[start - 1] ?? NORTH_POLE;
  const first = current[start]!;
  const last = current[end]!;
  const after = current[end + 1] ?? NORTH_POLE;
  return travelMinutes(before, last, config) + travelMinutes(first, after, config)
    - travelMinutes(before, first, config) - travelMinutes(last, after, config);
}

function reversedTour(current: Candidate[], start: number, end: number): Candidate[] {
  return [...current.slice(0, start), ...current.slice(start, end + 1).reverse(), ...current.slice(end + 1)];
}

function bestReversalProposal(current: Candidate[], config: GeneratorConfig, initial: TourProposal): TourProposal {
  let bestDelta = -IMPROVEMENT_EPSILON;
  let bestStart = -1;
  let bestEnd = -1;
  for (let start = 0; start < current.length - 1; start++) {
    for (let end = start + 1; end < current.length; end++) {
      if (!sameLocalMidnightBand(current, start, end)) continue;
      const delta = reversalTravelDelta(current, start, end, config);
      if (delta >= bestDelta) continue;
      bestDelta = delta;
      bestStart = start;
      bestEnd = end;
    }
  }
  if (bestStart < 0) return initial;
  return { places: reversedTour(current, bestStart, bestEnd), score: initial.score + bestDelta };
}

function sameLocalMidnightBand(order: Candidate[], start: number, end: number): boolean {
  return localMidnightRank(order[start]!) === localMidnightRank(order[end]!);
}

function relocatedTour(current: Candidate[], from: number, to: number): Candidate[] | undefined {
  const proposal = [...current];
  const [place] = proposal.splice(from, 1);
  if (!place) return undefined;
  proposal.splice(to, 0, place);
  return proposal;
}

function indexWithoutPlace(from: number, index: number): number {
  return index >= from ? index + 1 : index;
}

function relocationTravelDelta(current: Candidate[], from: number, to: number, config: GeneratorConfig): number {
  const place = current[from]!;
  const beforeRemoval = current[from - 1] ?? NORTH_POLE;
  const afterRemoval = current[from + 1] ?? NORTH_POLE;
  const insertionIndex = Math.min(to, current.length - 1);
  const previousIndex = insertionIndex - 1;
  const nextIndex = insertionIndex;
  const beforeInsertion = previousIndex < 0 ? NORTH_POLE : current[indexWithoutPlace(from, previousIndex)] ?? NORTH_POLE;
  const afterInsertion = nextIndex >= current.length - 1 ? NORTH_POLE : current[indexWithoutPlace(from, nextIndex)] ?? NORTH_POLE;
  const removedEdges = travelMinutes(beforeRemoval, place, config) + travelMinutes(place, afterRemoval, config);
  const removalBridge = travelMinutes(beforeRemoval, afterRemoval, config);
  const insertionBridge = travelMinutes(beforeInsertion, afterInsertion, config);
  const addedEdges = travelMinutes(beforeInsertion, place, config) + travelMinutes(place, afterInsertion, config);
  return removalBridge + addedEdges - removedEdges - insertionBridge;
}

function bestRelocationProposal(current: Candidate[], config: GeneratorConfig, initial: TourProposal): TourProposal {
  let bestDelta = -IMPROVEMENT_EPSILON;
  let bestFrom = -1;
  let bestTo = -1;
  for (let from = 0; from < current.length; from++) {
    const rank = localMidnightRank(current[from]!);
    const band = rankBandBounds(current, rank);
    for (let to = band.start; to <= band.end; to++) {
      if (Math.abs(from - to) < 2) continue;
      const delta = relocationTravelDelta(current, from, to, config);
      if (delta >= bestDelta) continue;
      bestDelta = delta;
      bestFrom = from;
      bestTo = to;
    }
  }
  if (bestFrom < 0) return initial;
  const proposal = relocatedTour(current, bestFrom, bestTo);
  if (!proposal) return initial;
  return { places: proposal, score: initial.score + bestDelta };
}

function bestTourProposal(current: Candidate[], score: number, config: GeneratorConfig): TourProposal {
  const initial = { places: current, score };
  const withReversals = bestReversalProposal(current, config, initial);
  return bestRelocationProposal(current, config, withReversals);
}

function improveTour(seed: Candidate[], config: GeneratorConfig): Candidate[] {
  const neighborSeed = midnightBiasedNearestNeighbor(seed, config);
  const useNeighbor = tourTravelMinutes(neighborSeed, config) < tourTravelMinutes(seed, config);
  let current = useNeighbor ? neighborSeed : [...seed];
  let score = tourTravelMinutes(current, config);
  for (let round = 0; round < MAX_TOUR_IMPROVEMENT_ROUNDS; round++) {
    const best = bestTourProposal(current, score, config);
    if (best.places === current) break;
    current = best.places;
    score = best.score;
  }
  return current;
}

function rankBandBounds(order: Candidate[], rank: number): { start: number; end: number } {
  let start = 0;
  while (start < order.length && localMidnightRank(order[start]!) < rank) start++;
  let end = start;
  while (end < order.length && localMidnightRank(order[end]!) === rank) end++;
  return { start, end };
}

function possibleInsertionIndexes(order: Candidate[], place: Candidate): number[] {
  const rank = localMidnightRank(place);
  const band = rankBandBounds(order, rank);
  if (band.start === band.end) return [band.start];
  const nearbyStops = nearestRouteIndexes(order, place, band.start, band.end);
  return [...new Set([band.start, band.end, ...nearbyStops])];
}

function nearestRouteIndexes(order: Candidate[], place: Candidate, start: number, end: number): number[] {
  let nearest = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = start; index < end; index++) {
    const stop = order[index]!;
    const latitudeDelta = stop.lat - place.lat;
    const longitudeOffset = longitudeDelta(place, stop) * Math.cos(place.lat * Math.PI / 180);
    const distance = latitudeDelta * latitudeDelta + longitudeOffset * longitudeOffset;
    if (distance >= nearestDistance) continue;
    nearest = index;
    nearestDistance = distance;
  }
  return nearest < 0 ? [] : [nearest, nearest + 1];
}

function insertionAt({ order, place, index, plan, config }: InsertionOptions): Insertion | undefined {
  const from = index === 0 ? NORTH_POLE : order[index - 1]!;
  const to = order[index] ?? NORTH_POLE;
  const fromDeparture = index === 0 ? Date.parse(TAKEOFF_UTC) : plan.departures[index - 1]!;
  const earliest = fromDeparture + scheduledTravelMilliseconds(from, place, config);
  const scheduled = scheduledLocalArrival(place, earliest);
  if (!scheduled) return undefined;
  const { arrival, waitMs } = scheduled;
  const extraMs = waitMs + scheduledTravelMilliseconds(from, place, config)
    + scheduledTravelMilliseconds(place, to, config) - scheduledTravelMilliseconds(from, to, config)
    + stopDurationSeconds(stopTier(place)) * 1000;
  const oldVia = order[index];
  const oldAfter = order[index + 1];
  const oldDetour = index > 0 && oldVia && oldAfter ? detourPenalty(from, oldVia, oldAfter) : 0;
  const cost = legCost(from, place, config) + legCost(place, to, config) - legCost(from, to, config)
    + stopDurationSeconds(stopTier(place)) / 60 + waitMs * MINUTES_PER_MS + localArrivalPenalty(place, arrival)
    + detourPenalty(from, place, to) - oldDetour;
  return { index, cost, extraMs, arrival };
}

function isWithinBudget(plan: Timing): boolean {
  return plan.returnArrival <= BUDGET_END;
}

function isInsertionWithinBudget(plan: Timing, impact: InsertionImpact): boolean {
  return plan.returnArrival + impact.returnDelayMs <= BUDGET_END;
}

function insertionImpact(order: Candidate[], place: Candidate, insertion: Insertion, plan: Timing): InsertionImpact | undefined {
  const placeStatus = localWindowStatus({ instant: insertion.arrival, offsetMinutes: place.utcOffsetMinutes ?? 0 });
  if (placeStatus === 'RED') return undefined;
  let greenCount = plan.greenCount + Number(placeStatus === 'GREEN');
  let upstreamShift = insertion.extraMs;
  for (let index = insertion.index; index < order.length; index++) {
    const next = order[index]!;
    const offset = next.utcOffsetMinutes ?? 0;
    const oldArrival = plan.arrivals[index]!;
    const oldEarliest = oldArrival - plan.waits[index]!;
    const scheduled = scheduledLocalArrival(next, oldEarliest + upstreamShift);
    if (!scheduled) return undefined;
    const shiftedArrival = scheduled.arrival;
    const oldStatus = localWindowStatus({ instant: oldArrival, offsetMinutes: offset });
    const shiftedStatus = localWindowStatus({ instant: shiftedArrival, offsetMinutes: offset });
    greenCount += Number(shiftedStatus === 'GREEN') - Number(oldStatus === 'GREEN');
    upstreamShift = shiftedArrival - oldArrival;
  }
  const currentShare = plan.greenCount / Math.max(1, order.length);
  const projectedShare = greenCount / (order.length + 1);
  if (projectedShare < 0.85 && projectedShare <= currentShare) return undefined;
  return { returnDelayMs: upstreamShift, greenCount };
}

function isNorthAmericanCountry(country: string): boolean {
  return country === 'US' || country === 'CA';
}

function countryStopCounts(places: Candidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const place of places) counts.set(place.country, (counts.get(place.country) ?? 0) + 1);
  return counts;
}

function countryHasOptionalCapacity(place: Candidate, counts: Map<string, number>): boolean {
  if ((counts.get(place.country) ?? 0) >= MAX_COUNTRY_STOPS) return false;
  if (!isNorthAmericanCountry(place.country)) return true;
  const combined = (counts.get('US') ?? 0) + (counts.get('CA') ?? 0);
  return combined < MAX_US_CA_STOPS;
}

function isAvailableOptionalCandidate(place: Candidate, selection: OptionalSelection): boolean {
  if (selection.selectedIds.has(place.id)) return false;
  if (!countryHasOptionalCapacity(place, selection.countryCounts)) return false;
  return selection.separation.allows(place);
}

function candidateImportanceBonus(place: Candidate): number {
  const population = Math.max(0, place.population ?? 0);
  const populationWeight = Math.log10(population + 1) * 0.9;
  const capitalWeight = isCapitalPlace(place) ? 0.7 : 0;
  const landmarkWeight = place.headlineLandmark ? 0.4 : 0;
  const worldCityWeight = place.worldCity ? 0.35 : 0;
  return populationWeight + capitalWeight + landmarkWeight + worldCityWeight;
}

function countryDepthBonus(place: Candidate, counts: Map<string, number>): number {
  const target = COUNTRY_DEPTH_TARGETS[place.country] ?? DEFAULT_COUNTRY_DEPTH_TARGET;
  const currentStops = counts.get(place.country) ?? 0;
  return (target - currentStops) * 8;
}

function optionalInsertionBonus(place: Candidate, counts: Map<string, number>): number {
  return candidateImportanceBonus(place) + countryDepthBonus(place, counts);
}

function betterInsertion(place: Candidate, rank: number, best: { place: Candidate; insertion: Insertion; rank: number } | undefined): boolean {
  if (!best) return true;
  if (rank < best.rank) return true;
  if (rank > best.rank) return false;
  return place.id.localeCompare(best.place.id) < 0;
}

function findBestLocalInsertion({ order, place, countryCounts, plan, config, random }: InsertionSearchOptions): RankedInsertion | undefined {
  let best: RankedInsertion | undefined;
  for (const index of possibleInsertionIndexes(order, place)) {
    const insertion = insertionAt({ order, place, index, plan, config });
    if (!insertion) continue;
    const rank = insertion.cost - optionalInsertionBonus(place, countryCounts) + random() * 0.0001;
    if (!betterInsertion(place, rank, best)) continue;
    best = { place, insertion, rank };
  }
  return best;
}

function compareRankedInsertions(a: RankedInsertion, b: RankedInsertion): number {
  return a.rank - b.rank || a.place.id.localeCompare(b.place.id);
}

function insertionIsFeasible(order: Candidate[], proposal: RankedInsertion, plan: Timing): boolean {
  const impact = insertionImpact(order, proposal.place, proposal.insertion, plan);
  return impact !== undefined && isInsertionWithinBudget(plan, impact);
}

function bestOptionalInsertion(selection: OptionalSelection, plan: Timing, config: GeneratorConfig): RankedInsertion | undefined {
  const ranked: RankedInsertion[] = [];
  for (const place of selection.pending) {
    if (!isAvailableOptionalCandidate(place, selection)) continue;
    const proposal = findBestLocalInsertion({ order: selection.route, place, countryCounts: selection.countryCounts, plan, config,
      random: selection.random });
    if (proposal) ranked.push(proposal);
  }
  ranked.sort(compareRankedInsertions);
  return ranked.find((proposal) => insertionIsFeasible(selection.route, proposal, plan));
}

function commitOptionalInsertion(selection: OptionalSelection, best: { place: Candidate; insertion: Insertion }): void {
  selection.route.splice(best.insertion.index, 0, best.place);
  selection.selectedIds.add(best.place.id);
  selection.countryCounts.set(best.place.country, (selection.countryCounts.get(best.place.country) ?? 0) + 1);
  selection.separation.add(best.place);
  selection.pending.splice(selection.pending.findIndex((place) => place.id === best.place.id), 1);
}

function canConsiderOptionalStops(selection: OptionalSelection): boolean {
  return selection.pending.length > 0 && selection.route.length < MAX_STOPS;
}

function optionalSelection(mandatory: Candidate[], pool: Candidate[], config: GeneratorConfig): OptionalSelection {
  const route = [...mandatory];
  const selectedIds = new Set(route.map((place) => place.id));
  const countryCounts = countryStopCounts(route);
  const separation = new SeparationIndex({ minimumKm: config.minStopSeparationKm });
  route.forEach((place) => separation.add(place));
  const pending = pool.filter((place) => !selectedIds.has(place.id)).sort((a, b) => a.id.localeCompare(b.id));
  return { route, selectedIds, countryCounts, separation, pending, random: seededRandom(config.seed) };
}

function addOptionalStops(mandatory: Candidate[], pool: Candidate[], config: GeneratorConfig): Candidate[] {
  const selection = optionalSelection(mandatory, pool, config);
  while (canConsiderOptionalStops(selection)) {
    const plan = timing(selection.route, config);
    if (!plan || !isWithinBudget(plan)) break;
    const best = bestOptionalInsertion(selection, plan, config);
    if (!best) break;
    commitOptionalInsertion(selection, best);
  }
  return selection.route;
}

function validateMandatorySelection(seed: { places: Candidate[]; missing: string[] }): void {
  if (seed.missing.length === 0) return;
  throw new Error(`Mandatory coverage cannot satisfy candidate availability or 20 km separation: ${seed.missing.slice(0, 20).join('; ')}`);
}

function validateMandatoryStopLimit(places: Candidate[]): void {
  if (places.length <= MAX_STOPS) return;
  throw new Error(`Mandatory coverage needs ${places.length} stops, above the ${MAX_STOPS} stop cap`);
}

function firstHardWindowFailure(order: Candidate[], config: GeneratorConfig): string | undefined {
  let previous: Candidate | typeof NORTH_POLE = NORTH_POLE;
  let departure = Date.parse(TAKEOFF_UTC);
  for (const place of order) {
    const earliest = departure + scheduledTravelMilliseconds(previous, place, config);
    const scheduled = scheduledLocalArrival(place, earliest);
    if (!scheduled) return `${place.name} cannot reach the next 22:30–05:30 local window within the tour order`;
    const { arrival } = scheduled;
    departure = arrival + stopDurationSeconds(stopTier(place)) * 1000;
    previous = place;
  }
  return undefined;
}

function assertWithinRouteBudget(final: Timing | undefined, mandatoryCount: number, order: Candidate[],
  config: GeneratorConfig): asserts final is Timing {
  if (final && isWithinBudget(final)) return;
  const returnAt = final ? new Date(final.returnArrival).toISOString() : 'no feasible timing';
  const overByMinutes = final ? Math.ceil((final.returnArrival - BUDGET_END) * MINUTES_PER_MS) : 0;
  const windowFailure = final ? undefined : firstHardWindowFailure(order, config);
  throw new Error(`Mandatory coverage cannot fit the 28-hour return budget. ${mandatoryCount} mandatory stops were retained; return would be ${returnAt} (${overByMinutes} minutes late). ${windowFailure ?? 'Speed and 20 km separation were enforced.'}`);
}

function assertRouteTargets(final: Timing): void {
  const count = final.places.length;
  const greenShare = final.greenCount / count;
  if (count < MIN_STOPS || count > MAX_STOPS) {
    throw new Error(`Route has ${count} stops; the required range is ${MIN_STOPS} to ${MAX_STOPS}.`);
  }
  if (greenShare < 0.85) {
    throw new Error(`Only ${(greenShare * 100).toFixed(1)}% of ${count} stops arrive from 23:00 to 05:00 local; at least 85% is required.`);
  }
}

export function orienteeringOrder(pool: Candidate[], config: GeneratorConfig = DEFAULT_GENERATOR_LIMITS): TimedCandidate[] {
  const seed = mandatoryTour(pool, config.minStopSeparationKm);
  validateMandatorySelection(seed);
  validateMandatoryStopLimit(seed.places);
  const improved = improveTour(seed.places, config);
  const selected = addOptionalStops(improved, pool, config);
  const final = timing(selected, config);
  assertWithinRouteBudget(final, seed.places.length, selected, config);
  assertRouteTargets(final);
  return final.places;
}
