import { haversineKm } from '../geo';
import { admin1UnitFor } from './admin1';
import { classifyRegion } from './regions';
import { scheduledTravelMilliseconds, seededRandom, REQUIRED_ADMIN1_CODES, SeparationIndex, type TimedCandidate } from './order-shared';
import { detourRatio, longitudeDelta, stopDurationSeconds, stopTier } from './sweep';
import { DEFAULT_GENERATOR_LIMITS, NORTH_POLE, RETURN_DEADLINE_UTC, TAKEOFF_UTC, type Candidate, type GeneratorConfig } from './types';

const MAX_STOPS = 700;
const MINUTES_PER_MS = 1 / 60_000;
const BUDGET_END = Date.parse(RETURN_DEADLINE_UTC);
const IMPROVEMENT_EPSILON = 0.01;

type Timing = { places: TimedCandidate[]; arrivals: number[]; departures: number[]; returnArrival: number };
type Insertion = { index: number; cost: number; extraMs: number };
type MandatorySelection = {
  chosen: Candidate[];
  separation: SeparationIndex;
  selected: Set<string>;
  missing: string[];
};
type TourProposal = { places: Candidate[]; score: number };
type OptionalSelection = {
  route: Candidate[];
  selectedIds: Set<string>;
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

function emptyMandatorySelection(minimumSeparationKm: number): MandatorySelection {
  return {
    chosen: [],
    separation: new SeparationIndex(minimumSeparationKm),
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

function addCountryRepresentative(country: string, candidates: Candidate[], minimumSeparationKm: number,
  selection: MandatorySelection): void {
  const sortedCandidates = candidatesByPriority(candidates);
  const place = sortedCandidates.find((candidate) => isEligibleMandatoryCandidate(candidate, selection));
  if (!place) {
    selection.missing.push(countryCoverageFailure(country, candidates, minimumSeparationKm, selection.chosen));
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
  for (const place of order) {
    const arrival = priorDeparture + scheduledTravelMilliseconds(prior, place, config);
    const tier = stopTier(place);
    const durationSeconds = stopDurationSeconds(tier);
    const departure = arrival + durationSeconds * 1000;
    places.push({ ...place, plannedArrivalUtc: new Date(arrival).toISOString(), plannedStopTier: tier, plannedStopDurationSeconds: durationSeconds });
    arrivals.push(arrival);
    departures.push(departure);
    prior = place;
    priorDeparture = departure;
  }
  const last = places.at(-1);
  if (!last) return undefined;
  const returnArrival = priorDeparture + scheduledTravelMilliseconds(last, NORTH_POLE, config);
  return { places, arrivals, departures, returnArrival };
}

function localArrivalPenalty(place: Candidate, arrival: number): number {
  const minute = new Date(arrival + (place.utcOffsetMinutes ?? 0) * 60_000).getUTCHours() * 60
    + new Date(arrival + (place.utcOffsetMinutes ?? 0) * 60_000).getUTCMinutes();
  const outside = minute < 23 * 60 ? 23 * 60 - minute : minute > 5 * 60 ? minute - 5 * 60 : 0;
  return Math.max(0, outside - 30) * 0.65;
}

function directionPenalty(from: Candidate | typeof NORTH_POLE, to: Candidate | typeof NORTH_POLE, config: GeneratorConfig): number {
  const eastwardDegrees = longitudeDelta(from, to);
  if (eastwardDegrees <= 1) return 0;
  const meanLatitude = (from.lat + to.lat) / 2;
  const clockMinutesLost = eastwardDegrees * 4 * Math.max(0.15, Math.cos(meanLatitude * Math.PI / 180));
  const travelMinutes = scheduledTravelMilliseconds(from, to, config) * MINUTES_PER_MS;
  return Math.max(0, clockMinutesLost - travelMinutes) * 0.35;
}

function regionCrossingPenalty(from: Candidate | typeof NORTH_POLE, to: Candidate | typeof NORTH_POLE, distanceKm: number): number {
  if (!('country' in from)) return 0;
  if (!('country' in to)) return 0;
  if (distanceKm < 3_500) return 0;
  const origin = classifyRegion(from);
  const destination = classifyRegion(to);
  if (origin.continent === destination.continent) return 0;
  return Math.min(45, distanceKm / 250);
}

function legCost(from: Candidate | typeof NORTH_POLE, to: Candidate | typeof NORTH_POLE, config: GeneratorConfig): number {
  const distance = haversineKm(from, to);
  const travelMinutes = scheduledTravelMilliseconds(from, to, config) * MINUTES_PER_MS;
  return travelMinutes + directionPenalty(from, to, config) + regionCrossingPenalty(from, to, distance);
}

function detourPenalty(from: Candidate | typeof NORTH_POLE, via: Candidate, to: Candidate | typeof NORTH_POLE): number {
  const ratio = detourRatio(from, via, to);
  return Math.max(0, ratio - 1.5) * 12;
}

function routeCostForStop(order: Candidate[], plan: Timing, index: number, config: GeneratorConfig): number {
  const place = order[index]!;
  const previous = order[index - 1] ?? NORTH_POLE;
  const next = order[index + 1] ?? NORTH_POLE;
  return legCost(previous, place, config)
    + localArrivalPenalty(place, plan.arrivals[index] ?? 0)
    + detourPenalty(previous, place, next);
}

function routeCost(order: Candidate[], config: GeneratorConfig): number {
  const plan = timing(order, config);
  if (!plan) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (const [index] of order.entries()) total += routeCostForStop(order, plan, index, config);
  const last = order.at(-1) ?? NORTH_POLE;
  total += legCost(last, NORTH_POLE, config);
  const overBudgetMinutes = Math.max(0, plan.returnArrival - BUDGET_END) * MINUTES_PER_MS;
  return total + overBudgetMinutes * 1_000;
}

function nearestNeighborScore(place: Candidate, previous: Candidate | typeof NORTH_POLE, previousDeparture: number,
  previousRank: number, config: GeneratorConfig): number {
  const rank = localMidnightRank(place);
  const arrival = previousDeparture + scheduledTravelMilliseconds(previous, place, config);
  const backtrackPenalty = Math.max(0, previousRank - rank - 60) * 2;
  const skippedWindowPenalty = Math.max(0, rank - previousRank - 240) * 0.35;
  return legCost(previous, place, config) + backtrackPenalty + skippedWindowPenalty + localArrivalPenalty(place, arrival);
}

function isBetterNearestNeighbor(place: Candidate, score: number, bestPlace: Candidate | undefined, bestScore: number): boolean {
  if (score < bestScore) return true;
  if (score > bestScore) return false;
  if (!bestPlace) return true;
  return place.id.localeCompare(bestPlace.id) < 0;
}

function midnightBiasedNearestNeighbor(seed: Candidate[], config: GeneratorConfig): Candidate[] {
  const remaining = [...seed];
  const order: Candidate[] = [];
  let previous: Candidate | typeof NORTH_POLE = NORTH_POLE;
  let previousDeparture = Date.parse(TAKEOFF_UTC);
  let previousRank = Number.NEGATIVE_INFINITY;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestPlace: Candidate | undefined;
    for (const [index, place] of remaining.entries()) {
      const score = nearestNeighborScore(place, previous, previousDeparture, previousRank, config);
      if (!isBetterNearestNeighbor(place, score, bestPlace, bestScore)) continue;
      bestIndex = index;
      bestScore = score;
      bestPlace = place;
    }
    const [next] = remaining.splice(bestIndex, 1);
    if (!next) break;
    const arrival = previousDeparture + scheduledTravelMilliseconds(previous, next, config);
    previousDeparture = arrival + stopDurationSeconds(stopTier(next)) * 1000;
    previousRank = Math.max(previousRank, localMidnightRank(next));
    order.push(next);
    previous = next;
  }
  return order;
}

function betterTourProposal(places: Candidate[], score: number, best: TourProposal): TourProposal {
  if (score + IMPROVEMENT_EPSILON < best.score) return { places, score };
  return best;
}

function bestReversalProposal(current: Candidate[], config: GeneratorConfig, initial: TourProposal): TourProposal {
  let best = initial;
  const spanLimit = current.length - 1;
  for (let start = 0; start < current.length - 1; start++) {
    for (let span = 2; span <= spanLimit && start + span <= current.length; span++) {
      const proposal = [...current.slice(0, start), ...current.slice(start, start + span).reverse(), ...current.slice(start + span)];
      best = betterTourProposal(proposal, routeCost(proposal, config), best);
    }
  }
  return best;
}

function relocatedTour(current: Candidate[], from: number, to: number): Candidate[] | undefined {
  const proposal = [...current];
  const [place] = proposal.splice(from, 1);
  if (!place) return undefined;
  proposal.splice(to, 0, place);
  return proposal;
}

function bestRelocationProposal(current: Candidate[], config: GeneratorConfig, initial: TourProposal): TourProposal {
  let best = initial;
  for (let from = 0; from < current.length; from++) {
    for (let to = 0; to <= current.length; to++) {
      if (Math.abs(from - to) < 2) continue;
      const proposal = relocatedTour(current, from, to);
      if (!proposal) continue;
      best = betterTourProposal(proposal, routeCost(proposal, config), best);
    }
  }
  return best;
}

function bestTourProposal(current: Candidate[], score: number, config: GeneratorConfig): TourProposal {
  const initial = { places: current, score };
  const withReversals = bestReversalProposal(current, config, initial);
  return bestRelocationProposal(current, config, withReversals);
}

function improveTour(seed: Candidate[], config: GeneratorConfig): Candidate[] {
  const neighborSeed = midnightBiasedNearestNeighbor(seed, config);
  const neighborScore = routeCost(neighborSeed, config);
  let current = neighborScore < routeCost(seed, config) ? neighborSeed : [...seed];
  let score = routeCost(current, config);
  for (let round = 0; round < 6; round++) {
    const best = bestTourProposal(current, score, config);
    if (best.places === current) break;
    current = best.places;
    score = best.score;
  }
  return current;
}

function possibleInsertionIndexes(order: Candidate[], place: Candidate): number[] {
  const rank = localMidnightRank(place);
  let low = 0;
  let high = order.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (localMidnightRank(order[middle]!) <= rank) low = middle + 1;
    else high = middle;
  }
  return [...new Set([0, order.length, low - 2, low - 1, low, low + 1, low + 2]
    .filter((index) => index >= 0 && index <= order.length))];
}

function insertionAt({ order, place, index, plan, config }: InsertionOptions): Insertion {
  const from = index === 0 ? NORTH_POLE : order[index - 1]!;
  const to = order[index] ?? NORTH_POLE;
  const fromDeparture = index === 0 ? Date.parse(TAKEOFF_UTC) : plan.departures[index - 1]!;
  const arrival = fromDeparture + scheduledTravelMilliseconds(from, place, config);
  const extraMs = scheduledTravelMilliseconds(from, place, config)
    + scheduledTravelMilliseconds(place, to, config) - scheduledTravelMilliseconds(from, to, config)
    + stopDurationSeconds(stopTier(place)) * 1000;
  const oldVia = order[index];
  const oldAfter = order[index + 1];
  const oldDetour = index > 0 && oldVia && oldAfter ? detourPenalty(from, oldVia, oldAfter) : 0;
  const cost = legCost(from, place, config) + legCost(place, to, config) - legCost(from, to, config)
    + stopDurationSeconds(stopTier(place)) / 60 + localArrivalPenalty(place, arrival)
    + detourPenalty(from, place, to) - oldDetour;
  return { index, cost, extraMs };
}

function isWithinBudget(plan: Timing): boolean {
  return plan.returnArrival <= BUDGET_END;
}

function isInsertionWithinBudget(plan: Timing, insertion: Insertion): boolean {
  return plan.returnArrival + insertion.extraMs <= BUDGET_END;
}

function betterInsertion(place: Candidate, rank: number, best: { place: Candidate; insertion: Insertion; rank: number } | undefined): boolean {
  if (!best) return true;
  if (rank < best.rank) return true;
  if (rank > best.rank) return false;
  return place.id.localeCompare(best.place.id) < 0;
}

function findBestInsertion({ order, place, plan, config, random }: InsertionSearchOptions,
  best: { place: Candidate; insertion: Insertion; rank: number } | undefined): { place: Candidate; insertion: Insertion; rank: number } | undefined {
  for (const index of possibleInsertionIndexes(order, place)) {
    const insertion = insertionAt({ order, place, index, plan, config });
    if (!isInsertionWithinBudget(plan, insertion)) continue;
    const rank = insertion.cost + random() * 0.0001;
    if (!betterInsertion(place, rank, best)) continue;
    best = { place, insertion, rank };
  }
  return best;
}

function isAvailableOptionalCandidate(place: Candidate, selection: OptionalSelection): boolean {
  if (selection.selectedIds.has(place.id)) return false;
  return selection.separation.allows(place);
}

function bestOptionalInsertion(selection: OptionalSelection, plan: Timing, config: GeneratorConfig): { place: Candidate; insertion: Insertion; rank: number } | undefined {
  let best: { place: Candidate; insertion: Insertion; rank: number } | undefined;
  for (const place of selection.pending) {
    if (!isAvailableOptionalCandidate(place, selection)) continue;
    best = findBestInsertion({ order: selection.route, place, plan, config, random: selection.random }, best);
  }
  return best;
}

function commitOptionalInsertion(selection: OptionalSelection, best: { place: Candidate; insertion: Insertion }): void {
  selection.route.splice(best.insertion.index, 0, best.place);
  selection.selectedIds.add(best.place.id);
  selection.separation.add(best.place);
  selection.pending.splice(selection.pending.findIndex((place) => place.id === best.place.id), 1);
}

function canConsiderOptionalStops(selection: OptionalSelection): boolean {
  return selection.pending.length > 0 && selection.route.length < MAX_STOPS;
}

function optionalSelection(mandatory: Candidate[], pool: Candidate[], config: GeneratorConfig): OptionalSelection {
  const route = [...mandatory];
  const selectedIds = new Set(route.map((place) => place.id));
  const separation = new SeparationIndex(config.minStopSeparationKm);
  route.forEach((place) => separation.add(place));
  const pending = pool.filter((place) => !selectedIds.has(place.id)).sort((a, b) => a.id.localeCompare(b.id));
  return { route, selectedIds, separation, pending, random: seededRandom(config.seed) };
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

function assertWithinRouteBudget(final: Timing | undefined, mandatoryCount: number): asserts final is Timing {
  if (final && isWithinBudget(final)) return;
  const returnAt = final ? new Date(final.returnArrival).toISOString() : 'no feasible timing';
  const overByMinutes = final ? Math.ceil((final.returnArrival - BUDGET_END) * MINUTES_PER_MS) : 0;
  throw new Error(`Mandatory coverage cannot fit the 28-hour return budget. ${mandatoryCount} mandatory stops were retained; return would be ${returnAt} (${overByMinutes} minutes late). Speed and 20 km separation were enforced.`);
}

export function orienteeringOrder(pool: Candidate[], config: GeneratorConfig = DEFAULT_GENERATOR_LIMITS): TimedCandidate[] {
  const seed = mandatoryTour(pool, config.minStopSeparationKm);
  validateMandatorySelection(seed);
  validateMandatoryStopLimit(seed.places);
  const improved = improveTour(seed.places, config);
  const selected = addOptionalStops(improved, pool, config);
  const final = timing(selected, config);
  assertWithinRouteBudget(final, seed.places.length);
  return final.places;
}
