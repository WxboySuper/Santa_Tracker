import { createLocationId, SCHEMA_VERSION, type Route } from '@santa-tracker/contracts';
import { validateRouteGeometry } from '../geometry-validate';
import { haversineKm, legSpeedKmh, type LatLng } from '../geo';
import { validateRoute } from '../validate';
import { applyOverrides, type RouteOverrides } from './overrides';
import { allocateQuotas, nearestNeighbour } from './selection';
import { christmasArrival } from './sweep';

export type Candidate = LatLng & {
  id: string; name: string; country: string; timezone: string; category: string;
  population?: number; worldCity?: boolean; source?: string; region?: string; plannedMinute?: number;
};
export type GeneratorConfig = {
  seed: number; total: number; weights?: Record<string, number>; arrivalStartMinute: number;
  arrivalEndMinute: number; durationSeconds: number; maxSpeedKmh: number; maxGapKm: number;
  maxCountryRun: number; minimumStopsPerHour: number; westernHours: number;
};
export type GeneratedRoute = {
  document: { meta: { year: number; route_version: string; generated_at: string }; route_nodes: Record<string, unknown>[] };
  route: Route; locations: Candidate[]; report: RouteReport;
};
export type RouteReport = {
  seed: number; count: number; mix: Record<string, { count: number; target: number }>;
  regionBalance: Record<string, number>;
  hourly: { hour: number; count: number }[]; fastestLeg: { from: string; to: string; km: number; kmh: number } | null;
  longestLegs: { from: string; to: string; km: number; kmh: number }[]; flags: { longGap: number; fastLeg: number; repeatCountry: number }[];
  issues: string[]; westernMinimum: number;
};
export const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  seed: 2026, total: 160,
  arrivalStartMinute: 20, arrivalEndMinute: 180, durationSeconds: 60, maxSpeedKmh: 40_000,
  maxGapKm: 1200, maxCountryRun: 8, minimumStopsPerHour: 4, westernHours: 8,
};

function stableHash(value: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
function categoryOf(place: Candidate): string {
  if (['hub', 'cultural', 'underserved', 'nature', 'special'].includes(place.category)) return place.category;
  if (place.worldCity) return 'hub';
  return 'underserved';
}
function selectCategory(
  places: Candidate[], category: string, quota: number, config: GeneratorConfig, countryBandCounts: Map<string, number>,
): string[] {
  const candidates = places.filter((place) => place.category === category)
    .sort((a, b) => stableHash(a.id, config.seed) - stableHash(b.id, config.seed) || a.id.localeCompare(b.id));
  const selected: string[] = [];
  const westernTarget = Math.floor(quota * 0.45);
  const western = candidates.filter((place) => christmasOffset(place.timezone) <= -240);
  const preferredWest = western.slice(0, westernTarget);
  const preferred = [...preferredWest, ...candidates.filter((place) => !preferredWest.includes(place))];
  for (const place of preferred) {
    if (selected.length === quota) break;
    const key = `${christmasOffset(place.timezone)}:${place.country}`;
    const count = countryBandCounts.get(key) ?? 0;
    if (count >= config.maxCountryRun) continue;
    selected.push(place.id);
    countryBandCounts.set(key, count + 1);
  }
  if (selected.length < quota) throw new Error(`Country cap prevents filling ${category} quota ${quota}`);
  return selected;
}
function chooseCandidates(pool: Candidate[], config: GeneratorConfig, overrides: RouteOverrides): Candidate[] {
  const categorized = pool.map((place) => ({ ...place, category: categoryOf(place) }));
  const quotas = allocateQuotas(config.total, config.weights ?? {});
  const countryBandCounts = new Map<string, number>();
  const selected = Object.entries(quotas).flatMap(([category, quota]) => selectCategory(categorized, category, quota, config, countryBandCounts));
  const adjusted = applyOverrides(categorized, selected, overrides);
  const byId = new Map(categorized.map((place) => [place.id, place]));
  if (adjusted.length < config.total) {
    const extra = categorized.filter((place) => !adjusted.includes(place.id) && !(overrides.veto ?? []).includes(place.id))
      .sort((a, b) => stableHash(a.id, config.seed) - stableHash(b.id, config.seed));
    adjusted.push(...extra.slice(0, config.total - adjusted.length).map((place) => place.id));
  }
  const chosen = adjusted.map((id) => byId.get(id)).filter((place): place is Candidate => place !== undefined);
  if (chosen.length !== config.total) throw new Error(`Unable to select ${config.total} unique candidates`);
  return chosen;
}
function christmasOffset(timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(Date.UTC(2026, 11, 25));
  const offset = parts.find((part) => part.type === 'timeZoneName')?.value.replace('GMT', '');
  if (!offset) throw new Error(`Missing UTC offset for ${timezone}`);
  const match = /^([+-])(\d{2}):?(\d{2})?$/.exec(offset);
  if (!match) throw new Error(`Invalid UTC offset for ${timezone}: ${offset}`);
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}
function localMinute(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const value = (key: string): number => Number(parts.find((part) => part.type === key)?.value);
  if (value('month') !== 12 || value('day') !== 25) return -1;
  return value('hour') * 60 + value('minute');
}
function appendCountryCappedBand(
  band: Candidate[], start: LatLng, ordered: Candidate[], maximumRun: number,
  runCountry: string | undefined, countryRun: number,
): { start: LatLng; runCountry: string | undefined; countryRun: number } {
  let current = start;
  const remaining = [...band];
  while (remaining.length > 0) {
    const eligible = remaining.filter((place) => place.country !== runCountry || countryRun < maximumRun);
    if (eligible.length === 0) throw new Error(`Country cap ${maximumRun} cannot be satisfied near ${runCountry}`);
    const next = nearestNeighbour(eligible, current)[0];
    if (!next) break;
    remaining.splice(remaining.findIndex((place) => place.id === next.id), 1);
    ordered.push(next);
    current = next;
    countryRun = next.country === runCountry ? countryRun + 1 : 1;
    runCountry = next.country;
  }
  return { start: current, runCountry, countryRun };
}
function sweepOrder(places: Candidate[], config: GeneratorConfig): Candidate[] {
  const bands = new Map<number, Candidate[]>();
  for (const place of places) {
    const offset = christmasOffset(place.timezone);
    const band = bands.get(offset) ?? [];
    band.push(place);
    bands.set(offset, band);
  }
  const ordered: Candidate[] = [];
  let start: LatLng = { lat: 0, lng: 180 };
  const windowSize = config.arrivalEndMinute - config.arrivalStartMinute - 60;
  for (const offset of [...bands.keys()].sort((a, b) => b - a)) {
    const band: Candidate[] = [];
    const result = appendCountryCappedBand(bands.get(offset) ?? [], start, band, config.maxCountryRun, undefined, 0);
    start = result.start;
    band.forEach((place, index) => {
      const fraction = band.length < 2 ? 0 : index / (band.length - 1);
      ordered.push({ ...place, plannedMinute: config.arrivalStartMinute + Math.round(fraction * windowSize) });
    });
  }
  ordered.sort((a, b) => Date.parse(christmasArrival(a.timezone, a.plannedMinute ?? config.arrivalStartMinute)) - Date.parse(christmasArrival(b.timezone, b.plannedMinute ?? config.arrivalStartMinute)) || a.id.localeCompare(b.id));
  let runCountry: string | undefined;
  let countryRun = 0;
  for (const place of ordered) {
    countryRun = place.country === runCountry ? countryRun + 1 : 1;
    runCountry = place.country;
    if (countryRun > config.maxCountryRun) throw new Error(`Country cap ${config.maxCountryRun} cannot be satisfied near ${runCountry}`);
  }
  return ordered.map((place, index) => ({ ...place, id: `${place.id}~${index}` }));
}
function buildDocument(places: Candidate[], config: GeneratorConfig): { document: GeneratedRoute['document']; route: Route; coordinates: Map<string, LatLng> } {
  const routeNodes: Record<string, unknown>[] = [];
  const stops: Route['stops'] = [];
  const coordinates = new Map<string, LatLng>();
  let lastDeparture = 0;
  let previousPlace: Candidate | undefined;
  for (const [index, place] of places.entries()) {
    const minute = place.plannedMinute ?? config.arrivalStartMinute;
    const instant = Date.parse(christmasArrival(place.timezone, minute));
    const distance = previousPlace ? haversineKm(previousPlace, place) : 0;
    const travelMs = distance / config.maxSpeedKmh * 3_600_000 * 1.001 + 1_000;
    const arrival = new Date(Math.max(instant, lastDeparture + Math.max(config.durationSeconds * 1000, travelMs))).toISOString();
    const actualMinute = localMinute(arrival, place.timezone);
    if (actualMinute < config.arrivalStartMinute || actualMinute > config.arrivalEndMinute) {
      throw new Error(`${place.name} arrives outside its local window at ${arrival}`);
    }
    const departure = new Date(Date.parse(arrival) + config.durationSeconds * 1000).toISOString();
    const id = `stop_${stableHash(place.id, config.seed).toString(36)}_${index}`;
    const locationId = createLocationId(id);
    coordinates.set(locationId, place);
    stops.push({ locationId, arrivalIso: arrival, departureIso: departure, durationSeconds: config.durationSeconds });
    lastDeparture = Date.parse(departure);
    previousPlace = place;
    routeNodes.push({ id, type: 'DELIVERY', location: { name: place.name, region: place.country, lat: place.lat, lng: place.lng, timezone_offset: christmasOffset(place.timezone) / 60 }, schedule: { arrival_utc: arrival, departure_utc: departure, local_arrival_time: null, time_window_status: null }, stop_experience: { duration_seconds: config.durationSeconds, camera_zoom: null, weather_condition: null, presents_delivered_at_stop: 0 }, transit_to_here: null, comment: place.category, notes: place.source ?? null, priority: 2 });
  }
  const route = { schemaVersion: SCHEMA_VERSION, season: 2026, stops } as Route;
  return { document: { meta: { year: 2026, route_version: '1.0', generated_at: '2026-12-24T00:00:00.000Z' }, route_nodes: routeNodes }, route, coordinates };
}
function buildReport(places: Candidate[], route: Route, config: GeneratorConfig, coordinates: Map<string, LatLng>): RouteReport {
  const mix: RouteReport['mix'] = {};
  const weights = config.weights ?? {};
  for (const [category, weight] of Object.entries(weights)) mix[category] = { count: places.filter((place) => place.category === category).length, target: Math.round(config.total * weight / Object.values(weights).reduce((a, b) => a + b, 0)) };
  const startIso = route.stops[0]?.arrivalIso ?? new Date(0).toISOString();
  const endIso = route.stops.at(-1)?.arrivalIso ?? startIso;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  const hourCount = Math.floor((end - start) / 3_600_000) + 1;
  const hourly = Array.from({ length: hourCount }, (_, hour) => ({ hour, count: route.stops.filter((stop) => Math.floor((Date.parse(stop.arrivalIso) - start) / 3_600_000) === hour).length }));
  const legs = route.stops.slice(1).map((stop, index) => {
    const previous = route.stops[index]; const from = previous ? coordinates.get(previous.locationId) : undefined; const to = coordinates.get(stop.locationId);
    const km = from && to ? haversineKm(from, to) : 0; const seconds = previous ? (Date.parse(stop.arrivalIso) - Date.parse(previous.departureIso)) / 1000 : 0;
    return { from: places[index]?.name ?? '', to: places[index + 1]?.name ?? '', km, kmh: legSpeedKmh(from ?? { lat: 0, lng: 0 }, to ?? { lat: 0, lng: 0 }, seconds) ?? 0, longGap: km > config.maxGapKm };
  });
  const hours = hourly.slice(-config.westernHours).map((entry) => entry.count);
  const regionBalance: Record<string, number> = {};
  for (const place of places) {
    const region = place.timezone.split('/')[0] ?? 'Unknown';
    regionBalance[region] = (regionBalance[region] ?? 0) + 1;
  }
  return { seed: config.seed, count: places.length, mix, regionBalance, hourly, fastestLeg: [...legs].sort((a, b) => b.kmh - a.kmh)[0] ?? null, longestLegs: [...legs].sort((a, b) => b.km - a.km).slice(0, 10), flags: legs.map((leg, index) => ({ longGap: Number(leg.km > config.maxGapKm), fastLeg: Number(leg.kmh > config.maxSpeedKmh), repeatCountry: Number(places[index]?.country === places[index + 1]?.country) })), issues: [], westernMinimum: hours.length ? Math.min(...hours) : 0 };
}
export function generateRoute(pool: Candidate[], config: GeneratorConfig = DEFAULT_GENERATOR_CONFIG, overrides: RouteOverrides = {}): GeneratedRoute {
  if (!config.weights || Object.keys(config.weights).length === 0) throw new Error('Category weights are required');
  const chosen = chooseCandidates(pool, config, overrides);
  const ordered = sweepOrder(chosen, config);
  const { document, route, coordinates } = buildDocument(ordered, config);
  const validation = validateRoute(route);
  if (!validation.ok) throw new Error(`Invalid generated route: ${validation.issues.map((issue) => issue.message).join('; ')}`);
  const geometry = validateRouteGeometry(route, coordinates, { maxSpeedKmh: config.maxSpeedKmh });
  const errors = geometry.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
  if (errors.length) throw new Error(`Invalid route geometry: ${errors.join('; ')}`);
  const report = buildReport(ordered, route, config, coordinates);
  report.issues = geometry.issues.map((issue) => issue.message);
  if (report.westernMinimum < config.minimumStopsPerHour) report.issues.push(`Western hourly minimum ${report.westernMinimum} is below target ${config.minimumStopsPerHour}; sparse final time zones limit available verified stops.`);
  const longLegs = report.flags.filter((flag) => flag.longGap > 0).length;
  if (longLegs > 0) report.issues.push(`Distance threshold relaxed for ${longLegs} legs over ${config.maxGapKm} km to preserve the global stop mix and the 26-hour sweep.`);
  return { document, route, locations: ordered, report };
}
