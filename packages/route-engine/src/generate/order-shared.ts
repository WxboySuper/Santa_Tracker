import { haversineKm, type LatLng } from '../geo';
import {
  christmasArrival,
  christmasWindow,
  detourRatio,
  eastwardLegReason,
  isEastwardDelta,
  longitudeDelta,
  stopDurationSeconds,
  stopTier,
} from './sweep';
import { classifyRegion } from './regions';
import { REQUIRED_ADMIN1_UNITS } from './admin1';
import { NORTH_POLE, RETURN_DEADLINE_UTC, TAKEOFF_UTC, type Candidate, type GeneratorConfig } from './types';

const EARTH_RADIUS_KM = 6_371;
const FAST_CROSSING_KM = 1_500;
const OCEAN_ISLAND_COUNTRIES = new Set([
  'AS', 'AW', 'AX', 'BB', 'BL', 'BM', 'BQ', 'BS', 'CC', 'CK', 'CX', 'CW', 'DM', 'FO', 'GD', 'GG', 'GL',
  'GP', 'GU', 'HM', 'IM', 'IO', 'IS', 'JE', 'JM', 'KN', 'KY', 'LC', 'MF', 'MH', 'MP', 'MQ', 'MS',
  'NF', 'NR', 'NU', 'PF', 'PN', 'PR', 'PW', 'RE', 'SC', 'SX', 'TC', 'TK', 'TO', 'TT', 'TV', 'VG', 'VI',
  'WF', 'YT',
]);

export const MAX_ROUTE_STOPS = 700;
export const REQUIRED_ADMIN1_CODES = new Set<string>(Object.values(REQUIRED_ADMIN1_UNITS).flatMap((codes) => [...codes]));

export type TimedCandidate = Candidate & {
  plannedArrivalUtc: string;
  plannedStopTier: NonNullable<Candidate['plannedStopTier']>;
  plannedStopDurationSeconds: number;
};
export type PlannedStop = { place: TimedCandidate; arrival: number; departure: number; eastwardDegrees: number };
export type RoutePlan = { places: TimedCandidate[]; arrivalTimes: number[]; departures: number[] };
type CandidateTimingOptions = { place: Candidate; prior: Candidate | LatLng; priorDeparture: number; index: number; config: GeneratorConfig };

export function seededRandom(seed: number): () => number {
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

export function countryCapacity(place: Candidate, counts: Map<string, number>, config: GeneratorConfig): boolean {
  // Bound dense fill so a few large countries cannot consume the route budget; mandatory country/admin-1 coverage bypasses this cap.
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

export class SeparationIndex {
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

function latestLocalArrival(place: Candidate, window: ReturnType<typeof christmasWindow>): number {
  if (place.lat >= -35) return window.endUtc;
  const southernLimit = Date.parse(christmasArrival({ timezoneOrOffset: requiredSnapshotOffset(place), minutesAfterMidnight: 150 }));
  return Math.min(window.endUtc, southernLimit);
}

export function requiredSnapshotOffset(place: Candidate): number {
  if (!Number.isInteger(place.utcOffsetMinutes)) throw new Error(`Missing snapshot UTC offset for ${place.name}`);
  return place.utcOffsetMinutes!;
}

function deliveryLongitudeIsAllowed(prior: Candidate | LatLng, place: Candidate, index: number, arrival: number): boolean {
  const degrees = longitudeDelta(prior, place);
  if (!isEastwardDelta(degrees)) return true;
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

export function timingAndDetourAllows(place: Candidate, route: Candidate[]): boolean {
  const prior = route.at(-1);
  if (!prior || route.length < 2) return true;
  const beforePrior = route.at(-2);
  if (!beforePrior) return true;
  if (route.filter((candidate) => candidate.country === prior.country).length === 1) return true;
  return detourRatio(beforePrior, prior, place) <= 2.5;
}

export function categoryPreference(place: Candidate, config: GeneratorConfig): number {
  if (place.category === 'capital') return config.weights.hub ?? 0;
  return config.weights[place.category] ?? 0;
}

export function canStartFromNorthPole(place: Candidate, config: GeneratorConfig): boolean {
  return Boolean(candidateTiming({ place, prior: NORTH_POLE, priorDeparture: Date.parse(TAKEOFF_UTC), index: 0, config }));
}

export function planTiming(order: Candidate[], config: GeneratorConfig): RoutePlan | undefined {
  const planned: TimedCandidate[] = [];
  const arrivalTimes: number[] = [];
  const departures: number[] = [];
  let prior: Candidate | LatLng = NORTH_POLE;
  let priorDeparture = Date.parse(TAKEOFF_UTC);
  for (const [index, place] of order.entries()) {
    const stop = candidateTiming({ place, prior, priorDeparture, index, config });
    if (!stop) return undefined;
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

export function hardDetourCount(order: Candidate[]): number {
  const countryCounts = new Map<string, number>();
  for (const place of order) countryCounts.set(place.country, (countryCounts.get(place.country) ?? 0) + 1);
  return order.reduce((count, via, index) => {
    const before = order[index - 1];
    const after = order[index + 1];
    return before && after && (countryCounts.get(via.country) ?? 0) > 1 && detourRatio(before, via, after) > 2.5
      ? count + 1 : count;
  }, 0);
}
