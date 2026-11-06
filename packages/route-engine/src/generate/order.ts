import { haversineKm, type LatLng } from '../geo';
import { christmasArrival } from './sweep';
import { localMinute } from './timezone';
import type { Candidate, GeneratorConfig } from './types';
import { compareStableIds } from './selection';

type StopWindow = { place: Candidate; lo: number; hi: number; midpoint: number };
type PlanState = { ordered: Candidate[]; current: LatLng; departure: number; country?: string; countryRun: number };
const HOUR_MS = 3_600_000;

function windowFor(place: Candidate, config: GeneratorConfig): StopWindow {
  const lo = Date.parse(christmasArrival(place.timezone, config.arrivalStartMinute));
  const hi = Date.parse(christmasArrival(place.timezone, config.arrivalEndMinute));
  return { place, lo, hi, midpoint: (lo + hi) / 2 };
}

function compareWindow(left: StopWindow, right: StopWindow): number {
  const difference = left.midpoint - right.midpoint;
  return difference || compareStableIds(left.place.id, right.place.id);
}

function bucketWindows(windows: StopWindow[]): Map<number, StopWindow[]> {
  const buckets = new Map<number, StopWindow[]>();
  for (const window of windows) {
    const key = Math.floor(window.midpoint / HOUR_MS);
    const bucket = buckets.get(key) ?? [];
    bucket.push(window);
    buckets.set(key, bucket);
  }
  return buckets;
}

function countryRunAllows(window: StopWindow, ordered: StopWindow[], maximumRun: number): boolean {
  const previous = ordered.at(-1)?.place.country;
  if (window.place.country !== previous) return true;
  let run = 0;
  for (let index = ordered.length - 1; index >= 0; index--) {
    if (ordered[index]?.place.country !== window.place.country) break;
    run++;
    if (run >= maximumRun) return false;
  }
  return true;
}

function takeNearest(remaining: StopWindow[], current: LatLng): StopWindow | undefined {
  return [...remaining].sort((left, right) => {
    const distanceDifference = haversineKm(current, left.place) - haversineKm(current, right.place);
    return distanceDifference || compareStableIds(left.place.id, right.place.id);
  })[0];
}

function orderBucket(bucket: StopWindow[], ordered: StopWindow[], current: LatLng, maximumCountryRun: number): LatLng {
  const remaining = [...bucket];
  let position = current;
  while (remaining.length > 0) {
    const eligible = remaining.filter((window) => countryRunAllows(window, ordered, maximumCountryRun));
    const choices = eligible.length > 0 ? eligible : remaining;
    const next = takeNearest(choices, position);
    if (!next) break;
    remaining.splice(remaining.findIndex((window) => window.place.id === next.place.id), 1);
    ordered.push(next);
    position = next.place;
  }
  return position;
}

function orderWindows(windows: StopWindow[], config: GeneratorConfig): StopWindow[] {
  const buckets = bucketWindows(windows);
  const ordered: StopWindow[] = [];
  let current: LatLng = { lat: 0, lng: 180 };
  const keys = [...buckets.keys()].sort((left, right) => left - right);
  for (const key of keys) {
    const remaining = buckets.get(key) ?? [];
    current = orderBucket(remaining, ordered, current, config.maxCountryRun);
  }
  return ordered;
}

function placeTime(window: StopWindow, state: PlanState, config: GeneratorConfig): number | null {
  const distance = state.ordered.length > 0 ? haversineKm(state.current, window.place) : 0;
  const speedLimit = config.allowFastLegs ? config.maxSpeedKmh : config.maxLegSpeedKmh;
  const travelMs = Math.ceil(distance / speedLimit * HOUR_MS);
  const earliest = Math.max(window.lo, state.departure + travelMs + 1);
  const rounded = Math.ceil(earliest / 60_000) * 60_000;
  return rounded <= window.hi ? rounded : null;
}

function planTimes(windows: StopWindow[], config: GeneratorConfig): Candidate[] {
  const state: PlanState = { ordered: [], current: { lat: 0, lng: 180 }, departure: 0, countryRun: 0 };
  for (const window of windows) {
    const timestamp = placeTime(window, state, config);
    if (timestamp === null) {
      const priorName = state.ordered.at(-1)?.name ?? 'route start';
      const distance = state.ordered.length ? haversineKm(state.current, window.place) : 0;
      const availableHours = Math.max(1 / 60, (window.hi - state.departure) / HOUR_MS);
      const availableMinutes = Math.max(1, Math.round(availableHours * 60));
      throw new Error(`Speed-aware schedule cannot fit leg ${priorName} to ${window.place.name}: ${Math.round(distance)} km in at most ${availableMinutes} min requires at least ${Math.round(distance / availableHours)} km/h inside the local arrival window`);
    }
    const plannedMinute = localMinute(new Date(timestamp).toISOString(), window.place.timezone);
    state.ordered.push({ ...window.place, plannedMinute });
    state.departure = timestamp + config.durationSeconds * 1000;
    state.current = window.place;
    state.countryRun = state.country === window.place.country ? state.countryRun + 1 : 1;
    state.country = window.place.country;
  }
  return state.ordered;
}

function assertCountryRun(places: Candidate[], maximumRun: number): void {
  let lastCountry: string | undefined;
  let countryRun = 0;
  for (const place of places) {
    countryRun = place.country === lastCountry ? countryRun + 1 : 1;
    lastCountry = place.country;
    if (countryRun > maximumRun) throw new Error(`Country cap ${maximumRun} cannot be satisfied near ${lastCountry}`);
  }
}

export function sweepOrder(places: Candidate[], config: GeneratorConfig): Candidate[] {
  const windows = places.map((place) => windowFor(place, config)).sort(compareWindow);
  const ordered = planTimes(orderWindows(windows, config), config);
  assertCountryRun(ordered, config.maxCountryRun);
  return ordered;
}
