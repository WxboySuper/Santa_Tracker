import { haversineKm } from '../geo';
import { admin1UnitFor } from './admin1';
import { classifyRegion } from './regions';
import { scheduledTravelMilliseconds, seededRandom, REQUIRED_ADMIN1_CODES, SeparationIndex, type TimedCandidate } from './order-shared';
import { detourRatio, longitudeDelta, stopDurationSeconds, stopTier } from './sweep';
import { DEFAULT_GENERATOR_LIMITS, NORTH_POLE, RETURN_DEADLINE_UTC, TAKEOFF_UTC, type Candidate, type GeneratorConfig } from './types';

const MAX_STOPS = 700;
const MINUTES_PER_MS = 1 / 60_000;
const BUDGET_END = Date.parse(RETURN_DEADLINE_UTC);

type Timing = { places: TimedCandidate[]; arrivals: number[]; departures: number[]; returnArrival: number };
type Insertion = { index: number; cost: number; extraMs: number };

function localMidnightRank(place: Candidate): number {
  return -(place.utcOffsetMinutes ?? 0);
}

function candidatePriority(place: Candidate): number {
  const population = place.population ?? 0;
  const isCapital = [place.isNationalCapital, place.isCapital, place.capital, place.category === 'capital'].some(Boolean);
  return Number(isCapital) * 1_000_000
    + Number(place.headlineLandmark) * 500_000 + Math.min(population, 400_000);
}

function candidatesByPriority(places: Candidate[]): Candidate[] {
  return [...places].sort((a, b) => candidatePriority(b) - candidatePriority(a)
    || localMidnightRank(a) - localMidnightRank(b) || a.id.localeCompare(b.id));
}

function mandatoryTour(pool: Candidate[], minimumSeparationKm: number): { places: Candidate[]; missing: string[] } {
  const chosen: Candidate[] = [];
  const separation = new SeparationIndex(minimumSeparationKm);
  const selected = new Set<string>();
  const missing: string[] = [];
  const units = new Map<string, Candidate[]>();
  for (const place of pool) {
    const unit = admin1UnitFor(place);
    if (unit && REQUIRED_ADMIN1_CODES.has(unit)) units.set(unit, [...(units.get(unit) ?? []), place]);
  }
  const orderedUnits = [...REQUIRED_ADMIN1_CODES].sort((a, b) => {
    const offsetA = Math.max(...(units.get(a) ?? []).map(localMidnightRank), -Infinity);
    const offsetB = Math.max(...(units.get(b) ?? []).map(localMidnightRank), -Infinity);
    return offsetA - offsetB || a.localeCompare(b);
  });
  for (const unit of orderedUnits) {
    const candidates = candidatesByPriority(units.get(unit) ?? []);
    const place = candidates.find((candidate) => separation.allows(candidate));
    if (!place) {
      missing.push(`${unit}: no candidate at least ${minimumSeparationKm} km from the mandatory stops`);
      continue;
    }
    chosen.push(place);
    selected.add(place.id);
    separation.add(place);
  }

  const countries = new Set(pool.map((place) => place.country));
  const represented = new Set(chosen.map((place) => place.country));
  const countryCandidates = new Map<string, Candidate[]>();
  for (const place of pool) {
    if (!countryCandidates.has(place.country)) countryCandidates.set(place.country, []);
    countryCandidates.get(place.country)?.push(place);
  }
  const countryOrder = [...countries].sort((a, b) => (countryCandidates.get(a)?.length ?? 0) - (countryCandidates.get(b)?.length ?? 0)
    || a.localeCompare(b));
  for (const country of countryOrder) {
    if (represented.has(country)) continue;
    const place = candidatesByPriority(countryCandidates.get(country) ?? [])
      .find((candidate) => !selected.has(candidate.id) && separation.allows(candidate));
    if (!place) {
      const nearest = candidatesByPriority(countryCandidates.get(country) ?? [])
        .flatMap((candidate) => chosen.map((selectedPlace) => ({ candidate, selectedPlace, km: haversineKm(candidate, selectedPlace) })))
        .sort((a, b) => a.km - b.km || a.candidate.id.localeCompare(b.candidate.id))[0];
      missing.push(nearest
        ? `${country}: no representative at least ${minimumSeparationKm} km from mandatory stops; closest ${nearest.candidate.name} is ${nearest.km.toFixed(1)} km from ${nearest.selectedPlace.name} (${nearest.selectedPlace.country})`
        : `${country}: no country representative at least ${minimumSeparationKm} km from mandatory stops`);
      continue;
    }
    chosen.push(place);
    selected.add(place.id);
    represented.add(country);
    separation.add(place);
  }
  return { places: chosen.sort((a, b) => localMidnightRank(a) - localMidnightRank(b) || a.id.localeCompare(b.id)), missing };
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
  if (!('country' in from) || !('country' in to) || distanceKm < 3_500) return 0;
  const origin = classifyRegion(from);
  const destination = classifyRegion(to);
  return origin.continent === destination.continent ? 0 : Math.min(45, distanceKm / 250);
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

function routeCost(order: Candidate[], config: GeneratorConfig): number {
  const plan = timing(order, config);
  if (!plan) return Number.POSITIVE_INFINITY;
  let total = 0;
  let previous: Candidate | typeof NORTH_POLE = NORTH_POLE;
  for (const [index, place] of order.entries()) {
    total += legCost(previous, place, config) + localArrivalPenalty(place, plan.arrivals[index] ?? 0);
    const next = order[index + 1] ?? NORTH_POLE;
    total += detourPenalty(previous, place, next);
    previous = place;
  }
  total += legCost(previous, NORTH_POLE, config);
  const overBudgetMinutes = Math.max(0, plan.returnArrival - BUDGET_END) * MINUTES_PER_MS;
  return total + overBudgetMinutes * 1_000;
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
    for (const [index, place] of remaining.entries()) {
      const rank = localMidnightRank(place);
      const arrival = previousDeparture + scheduledTravelMilliseconds(previous, place, config);
      const backtrackPenalty = Math.max(0, previousRank - rank - 60) * 2;
      const skippedWindowPenalty = Math.max(0, rank - previousRank - 240) * 0.35;
      const score = legCost(previous, place, config) + backtrackPenalty + skippedWindowPenalty
        + localArrivalPenalty(place, arrival);
      if (score < bestScore || (score === bestScore && place.id.localeCompare(remaining[bestIndex]!.id) < 0)) {
        bestIndex = index;
        bestScore = score;
      }
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

function improveTour(seed: Candidate[], config: GeneratorConfig): Candidate[] {
  const neighborSeed = midnightBiasedNearestNeighbor(seed, config);
  let current = routeCost(neighborSeed, config) < routeCost(seed, config) ? neighborSeed : [...seed];
  let score = routeCost(current, config);
  const maxRounds = 6;
  for (let round = 0; round < maxRounds; round++) {
    let best = current;
    let bestScore = score;
    const spanLimit = current.length - 1;
    for (let start = 0; start < current.length - 1; start++) {
      for (let span = 2; span <= spanLimit && start + span <= current.length; span++) {
        const proposal = [...current.slice(0, start), ...current.slice(start, start + span).reverse(), ...current.slice(start + span)];
        const proposalScore = routeCost(proposal, config);
        if (proposalScore + 0.01 < bestScore) { best = proposal; bestScore = proposalScore; }
      }
    }
    for (let from = 0; from < current.length; from++) {
      for (let to = 0; to <= current.length; to++) {
        if (Math.abs(from - to) < 2) continue;
        const proposal = [...current];
        const [place] = proposal.splice(from, 1);
        if (!place) continue;
        proposal.splice(to, 0, place);
        const proposalScore = routeCost(proposal, config);
        if (proposalScore + 0.01 < bestScore) { best = proposal; bestScore = proposalScore; }
      }
    }
    if (best === current) break;
    current = best;
    score = bestScore;
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

function insertionAt(order: Candidate[], place: Candidate, index: number, plan: Timing, config: GeneratorConfig): Insertion {
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

function addOptionalStops(mandatory: Candidate[], pool: Candidate[], config: GeneratorConfig): Candidate[] {
  const route = [...mandatory];
  const selectedIds = new Set(route.map((place) => place.id));
  const separation = new SeparationIndex(config.minStopSeparationKm);
  route.forEach((place) => separation.add(place));
  const random = seededRandom(config.seed);
  const pending = pool.filter((place) => !selectedIds.has(place.id)).sort((a, b) => a.id.localeCompare(b.id));
  while (pending.length > 0 && route.length < MAX_STOPS) {
    const plan = timing(route, config);
    if (!plan || plan.returnArrival > BUDGET_END) break;
    let best: { place: Candidate; insertion: Insertion; rank: number } | undefined;
    for (const place of pending) {
      if (!separation.allows(place)) continue;
      for (const index of possibleInsertionIndexes(route, place)) {
        const insertion = insertionAt(route, place, index, plan, config);
        if (plan.returnArrival + insertion.extraMs > BUDGET_END) continue;
        const rank = insertion.cost + random() * 0.0001;
        if (!best || rank < best.rank || (rank === best.rank && place.id.localeCompare(best.place.id) < 0)) {
          best = { place, insertion, rank };
        }
      }
    }
    if (!best) break;
    route.splice(best.insertion.index, 0, best.place);
    selectedIds.add(best.place.id);
    separation.add(best.place);
    pending.splice(pending.findIndex((place) => place.id === best.place.id), 1);
  }
  return route;
}

export function orienteeringOrder(pool: Candidate[], config: GeneratorConfig = DEFAULT_GENERATOR_LIMITS): TimedCandidate[] {
  const seed = mandatoryTour(pool, config.minStopSeparationKm);
  if (seed.missing.length > 0) {
    throw new Error(`Mandatory coverage cannot satisfy candidate availability or 20 km separation: ${seed.missing.slice(0, 20).join('; ')}`);
  }
  if (seed.places.length > MAX_STOPS) throw new Error(`Mandatory coverage needs ${seed.places.length} stops, above the ${MAX_STOPS} stop cap`);
  const improved = improveTour(seed.places, config);
  const selected = addOptionalStops(improved, pool, config);
  const final = timing(selected, config);
  if (!final || final.returnArrival > BUDGET_END) {
    const returnAt = final ? new Date(final.returnArrival).toISOString() : 'no feasible timing';
    const overByMinutes = final ? Math.ceil((final.returnArrival - BUDGET_END) * MINUTES_PER_MS) : 0;
    throw new Error(`Mandatory coverage cannot fit the 28-hour return budget. ${seed.places.length} mandatory stops were retained; return would be ${returnAt} (${overByMinutes} minutes late). Speed and 20 km separation were enforced.`);
  }
  return final.places;
}
