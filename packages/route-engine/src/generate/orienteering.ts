import { haversineKm } from '../geo';
import { admin1UnitFor } from './admin1';
import { planTiming, seededRandom, REQUIRED_ADMIN1_CODES, type TimedCandidate } from './order-shared';
import { DEFAULT_GENERATOR_LIMITS, NORTH_POLE, TAKEOFF_UTC, type Candidate, type GeneratorConfig } from './types';

const BUDGET_MS = 28 * 60 * 60 * 1000;

function mandatoryIds(pool: Candidate[]): Set<string> {
  const ids = new Set<string>();
  const countries = new Set<string>();
  const admin1 = new Set<string>();
  for (const place of pool) {
    if (!countries.has(place.country)) { countries.add(place.country); ids.add(place.id); }
    const unit = admin1UnitFor(place);
    if (unit && REQUIRED_ADMIN1_CODES.has(unit) && !admin1.has(unit)) { admin1.add(unit); ids.add(place.id); }
  }
  return ids;
}

function insertionCost(route: Candidate[], place: Candidate, config: GeneratorConfig): number {
  const previous = route.at(-1) ?? NORTH_POLE;
  const distance = haversineKm(previous, place);
  const speed = Math.min(config.localLegSpeedKmh, config.maxLegSpeedKmh);
  const travelMinutes = distance / speed * 60;
  const eastward = ((place.lng - previous.lng + 540) % 360) - 180;
  const backtrack = eastward > 1 ? eastward * 0.4 : 0;
  const localHour = new Date(Date.parse(TAKEOFF_UTC) - (place.utcOffsetMinutes ?? 0) * 60_000).getUTCHours();
  const windowPenalty = Math.max(0, Math.abs(localHour - 0) - 3) * 2;
  return travelMinutes + backtrack + windowPenalty;
}

function feasible(order: Candidate[], config: GeneratorConfig): boolean {
  const plan = planTiming(order, config);
  return Boolean(plan && plan.departures.at(-1)! + Math.ceil(haversineKm(plan.places.at(-1)!, NORTH_POLE) / config.maxLegSpeedKmh * 3_600_000) <= Date.parse(TAKEOFF_UTC) + BUDGET_MS);
}

function routeDistance(order: Candidate[]): number {
  let total = 0;
  let previous: Candidate | typeof NORTH_POLE = NORTH_POLE;
  for (const place of order) { total += haversineKm(previous, place); previous = place; }
  return total + haversineKm(previous, NORTH_POLE);
}

function improve(order: Candidate[], config: GeneratorConfig, random: () => number): Candidate[] {
  let current = [...order];
  let changed = true;
  let rounds = 0;
  while (changed && rounds++ < 200) {
    changed = false;
    for (let span = current.length - 1; span >= 2 && !changed; span--) {
      const start = Math.floor(random() * (current.length - span));
      const proposal = [...current.slice(0, start), ...current.slice(start, start + span).reverse(), ...current.slice(start + span)];
      if (routeDistance(proposal) + 1 < routeDistance(current) && feasible(proposal, config)) { current = proposal; changed = true; }
    }
    for (let from = 0; from < current.length && !changed; from++) {
      for (let to = 0; to < current.length; to++) {
        if (Math.abs(from - to) < 2) continue;
        const proposal = [...current];
        const [item] = proposal.splice(from, 1);
        proposal.splice(to, 0, item!);
        if (routeDistance(proposal) + 1 < routeDistance(current) && feasible(proposal, config)) { current = proposal; changed = true; break; }
      }
    }
  }
  return current;
}

export function orienteeringOrder(pool: Candidate[], config: GeneratorConfig = DEFAULT_GENERATOR_LIMITS): TimedCandidate[] {
  const mandatory = mandatoryIds(pool);
  const random = seededRandom(config.seed);
  const pendingMandatory = pool.filter((place) => mandatory.has(place.id)).sort((a, b) => a.id.localeCompare(b.id));
  const pendingOptional = pool.filter((place) => !mandatory.has(place.id)).sort((a, b) => a.id.localeCompare(b.id));
  const route: Candidate[] = [];
  for (const place of pendingMandatory) {
    const feasiblePositions = Array.from({ length: route.length + 1 }, (_, index) => index)
      .map((index) => ({ index, cost: insertionCost(route.slice(0, index), place, config) + random() * 0.001 }))
      .sort((a, b) => a.cost - b.cost || a.index - b.index);
    const position = feasiblePositions.find(({ index }) => feasible([...route.slice(0, index), place, ...route.slice(index)], config));
    if (position) route.splice(position.index, 0, place);
  }
  while (pendingOptional.length && route.length < 700) {
    const ranked = pendingOptional.map((place) => ({ place, cost: insertionCost(route, place, config) + random() * 0.001 }))
      .sort((a, b) => a.cost - b.cost || a.place.id.localeCompare(b.place.id));
    let inserted = false;
    for (const candidate of ranked) {
      const proposal = [...route, candidate.place];
      if (feasible(proposal, config)) { route.push(candidate.place); pendingOptional.splice(pendingOptional.findIndex((p) => p.id === candidate.place.id), 1); inserted = true; break; }
    }
    if (!inserted) break;
  }
  const improved = improve(route, config, random);
  const plan = planTiming(improved, config);
  if (!plan) throw new Error('Orienteering route has no feasible timing');
  return plan.places;
}
