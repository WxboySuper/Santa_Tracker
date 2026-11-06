import type { LatLng } from '../geo';
import { compareStableIds, nearestNeighbour } from './selection';
import { christmasArrival } from './sweep';
import { christmasOffset } from './timezone';
import type { Candidate, GeneratorConfig } from './types';

type OrderState = { current: LatLng; ordered: Candidate[] };
function addPlannedBand(band: Candidate[], target: Candidate[], config: GeneratorConfig): void {
  const availableMinutes = Math.max(0, config.arrivalEndMinute - config.arrivalStartMinute - 60);
  band.forEach((place, index) => {
    const fraction = band.length < 2 ? 0 : index / (band.length - 1);
    target.push({ ...place, plannedMinute: config.arrivalStartMinute + Math.round(fraction * availableMinutes) });
  });
}
function sortByPlannedArrival(places: Candidate[], config: GeneratorConfig): Candidate[] {
  return [...places].sort((a, b) => {
    const difference = Date.parse(christmasArrival(a.timezone, a.plannedMinute ?? config.arrivalStartMinute)) - Date.parse(christmasArrival(b.timezone, b.plannedMinute ?? config.arrivalStartMinute));
    return difference === 0 ? compareStableIds(a.id, b.id) : difference;
  });
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
  const bands = new Map<number, Candidate[]>();
  for (const place of places) {
    const offset = christmasOffset(place.timezone);
    const band = bands.get(offset) ?? [];
    band.push(place);
    bands.set(offset, band);
  }
  const state: OrderState = { current: { lat: 0, lng: 180 }, ordered: [] };
  const offsets = [...bands.keys()].sort((a, b) => b - a);
  for (const offset of offsets) appendBand(bands.get(offset) ?? [], state, config);
  const ordered = sortByPlannedArrival(state.ordered, config);
  assertCountryRun(ordered, config.maxCountryRun);
  return ordered;
}
function appendBand(band: Candidate[], state: OrderState, config: GeneratorConfig): void {
  const orderedBand = nearestNeighbour(band, state.current);
  addPlannedBand(orderedBand, state.ordered, config);
  state.current = orderedBand.at(-1) ?? state.current;
}
