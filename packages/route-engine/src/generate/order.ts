import type { LatLng } from '../geo';
import { nearestNeighbour } from './selection';
import { christmasArrival } from './sweep';
import { christmasOffset } from './timezone';
import type { Candidate, GeneratorConfig } from './types';

type OrderState = { current: LatLng; ordered: Candidate[]; country?: string; countryRun: number };
function appendCountryCappedBand(band: Candidate[], state: OrderState, maximumRun: number): void {
  const remaining = [...band];
  while (remaining.length > 0) {
    const eligible = remaining.filter((place) => place.country !== state.country || state.countryRun < maximumRun);
    if (eligible.length === 0) throw new Error(`Country cap ${maximumRun} cannot be satisfied near ${state.country}`);
    const next = nearestNeighbour(eligible, state.current)[0];
    if (!next) break;
    remaining.splice(remaining.findIndex((place) => place.id === next.id), 1);
    state.ordered.push(next);
    state.current = next;
    state.countryRun = next.country === state.country ? state.countryRun + 1 : 1;
    state.country = next.country;
  }
}
function addPlannedBand(band: Candidate[], target: Candidate[], config: GeneratorConfig): void {
  const availableMinutes = Math.max(0, config.arrivalEndMinute - config.arrivalStartMinute - 60);
  band.forEach((place, index) => {
    const fraction = band.length < 2 ? 0 : index / (band.length - 1);
    target.push({ ...place, plannedMinute: config.arrivalStartMinute + Math.round(fraction * availableMinutes) });
  });
}
function sortByPlannedArrival(places: Candidate[], config: GeneratorConfig): Candidate[] {
  return places.sort((a, b) => Date.parse(christmasArrival(a.timezone, a.plannedMinute ?? config.arrivalStartMinute)) - Date.parse(christmasArrival(b.timezone, b.plannedMinute ?? config.arrivalStartMinute)) || a.id.localeCompare(b.id));
}
export function sweepOrder(places: Candidate[], config: GeneratorConfig): Candidate[] {
  const bands = new Map<number, Candidate[]>();
  for (const place of places) {
    const offset = christmasOffset(place.timezone);
    const band = bands.get(offset) ?? [];
    band.push(place);
    bands.set(offset, band);
  }
  const state: OrderState = { current: { lat: 0, lng: 180 }, ordered: [], countryRun: 0 };
  for (const offset of [...bands.keys()].sort((a, b) => b - a)) {
    const band: Candidate[] = [];
    appendCountryCappedBand(bands.get(offset) ?? [], { ...state, ordered: band, countryRun: 0, country: undefined }, config.maxCountryRun);
    addPlannedBand(band, state.ordered, config);
    state.current = band.at(-1) ?? state.current;
  }
  const ordered = sortByPlannedArrival(state.ordered, config);
  for (const [index, place] of ordered.entries()) {
    state.countryRun = place.country === state.country ? state.countryRun + 1 : 1;
    state.country = place.country;
    if (state.countryRun > config.maxCountryRun) throw new Error(`Country cap ${config.maxCountryRun} cannot be satisfied near ${state.country}`);
    place.id = `${place.id}~${index}`;
  }
  return ordered;
}
