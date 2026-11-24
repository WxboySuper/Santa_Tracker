import { LegacyRouteFixtureSchema } from '@santa-tracker/contracts';
import { haversineKm, legSpeedKmh } from '../geo';
import { allocateQuotas } from './selection';
import { classifyRegion, formatUtcOffset } from './regions';
import { localMinute } from './timezone';
import { NORTH_POLE, TAKEOFF_UTC, type Candidate, type GeneratorConfig, type RouteReport } from './types';

export type AuditCheck = { name: string; pass: boolean; detail: string };
export type AuditResult = { checks: AuditCheck[]; pass: boolean };

export type RouteAuditContext = {
  config: GeneratorConfig;
  pool: Candidate[];
  selected: Candidate[];
  zonesByCountry: Record<string, string[]>;
  utcOffsetsByTimezone: Record<string, number>;
  countryBoundsByCode: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }>;
  report: Pick<RouteReport, 'continentBalance' | 'subregionBalance'>;
  vetoIds: string[];
};

type RouteNode = {
  id: string;
  type: string;
  candidate_id?: string;
  comment?: string;
  location: {
    name: string;
    country_code?: string;
    timezone?: string;
    lat: number;
    lng: number;
    timezone_offset?: number;
  };
  schedule: {
    arrival_utc: string | null;
    departure_utc: string;
    local_arrival_time?: string | null;
  };
  stop_experience?: { presents_delivered_at_stop?: number | null; camera_zoom?: number | null; weather_condition?: string | null };
  transit_to_here?: { duration_seconds?: number | null; distance_km?: number | null; speed_kmh?: number | null } | null;
  notes?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function routeNodes(document: unknown): RouteNode[] {
  if (!isRecord(document) || !Array.isArray(document.route_nodes)) return [];
  return document.route_nodes.filter((node): node is RouteNode => isRecord(node) && typeof node.id === 'string' && isRecord(node.location) && isRecord(node.schedule));
}

function percent(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0;
}

function human(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function coordinateAuditFailures(places: Candidate[], pool: Candidate[], boundsByCode: RouteAuditContext['countryBoundsByCode']): string[] {
  const failures: string[] = [];
  for (const place of places) {
    const bounds = boundsByCode[place.country];
    if (!bounds) {
      failures.push(`${place.name}: no Natural Earth country bounds for ${place.country}`);
      continue;
    }
    const margin = 0.25;
    if (place.lat < bounds.minLat - margin || place.lat > bounds.maxLat + margin
      || place.lng < bounds.minLng - margin || place.lng > bounds.maxLng + margin) {
      failures.push(`${place.name}: coordinates fall outside the ${place.country} country bounds`);
    }
    const name = normalizedPlaceName(place.name);
    const alternatives = pool.filter((candidate) => candidate.country === place.country
      && candidate.id !== place.id && normalizedPlaceName(candidate.name) === name
      && sourceFamily(candidate.source) !== sourceFamily(place.source));
    for (const alternative of alternatives) {
      const separation = haversineKm(place, alternative);
      if (separation > 100) failures.push(`${place.name}: ${Math.round(separation)} km from alternate-source ${alternative.id} with the same country and name`);
    }
  }
  return failures;
}

function countsByRegion<T extends { continent: string; subregion: string }>(
  regions: T[],
  key: (region: T) => string,
): Record<string, number> {
  return regions.reduce<Record<string, number>>((counts, region) => {
    const name = key(region);
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});
}

function normalizedPlaceName(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en').replace(/[^a-z0-9]/g, '');
}

function sourceUrl(source: string | undefined): URL | undefined {
  if (!source) return undefined;
  try {
    const url = new URL(source);
    return url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function sourceFamily(source: string | undefined): string {
  const url = sourceUrl(source);
  if (isWikidataSource(url)) return 'wikidata';
  if (isNaturalEarthSource(url)) return 'natural-earth';
  return source ?? 'unknown';
}

function isWikidataSource(url: URL | undefined): boolean {
  return url?.hostname === 'www.wikidata.org' && /^\/wiki\/Q\d+$/.test(url.pathname);
}

function isNaturalEarthSource(url: URL | undefined): boolean {
  return url?.hostname === 'www.naturalearthdata.com' && url.pathname.startsWith('/downloads/');
}

function isTrustedSource(source: string | null | undefined): boolean {
  const url = sourceUrl(source ?? undefined);
  return isWikidataSource(url) || isNaturalEarthSource(url);
}

function sameCounts(left: Record<string, number>, right: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

function canBeSelected(place: Candidate, config: GeneratorConfig, veto: Set<string>): boolean {
  if (isExcludedCandidate(place, config, veto)) return false;
  if (['cultural', 'nature', 'special'].includes(place.category)) return true;
  if (place.worldCity === true) return true;
  if ((place.population ?? 0) >= config.hubPopulationMinimum) return true;
  return config.underservedCountries.includes(place.country);
}

function isExcludedCandidate(place: Candidate, config: GeneratorConfig, veto: Set<string>): boolean {
  if (veto.has(place.id)) return true;
  if (config.uninhabitedIslandIds.includes(place.id)) return true;
  return place.utcOffsetMinutes === undefined;
}

type AuditView = {
  nodes: RouteNode[];
  delivery: RouteNode[];
  start?: RouteNode;
  end?: RouteNode;
  matched: boolean;
  places: Candidate[];
};

type AuditLeg = { km: number; kmh: number; gapMinutes: number; eastward: number; kind: string };

function addCheck(checks: AuditCheck[], name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
}

function createAuditView(document: unknown, context: RouteAuditContext): AuditView {
  const nodes = routeNodes(document);
  const delivery = nodes.filter((node) => node.type === 'DELIVERY');
  const byId = new Map(context.selected.map((place) => [place.id, place]));
  const candidates = delivery.map((node) => node.candidate_id ? byId.get(node.candidate_id) : undefined);
  return {
    nodes,
    delivery,
    start: nodes.find((node) => node.type === 'START'),
    end: nodes.find((node) => node.type === 'END'),
    matched: candidates.every((place) => place !== undefined) && candidates.length === delivery.length,
    places: candidates.filter((place): place is Candidate => place !== undefined),
  };
}

function addHeaderChecks(document: unknown, context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const validFixture = LegacyRouteFixtureSchema.safeParse(document).success;
  addCheck(checks, 'Legacy route schema', validFixture, validFixture ? 'Legacy route fixture parses.' : 'Legacy route fixture does not parse.');
  const { nodes, start, end } = view;
  const northPoleEndpoints = !!start && !!end && nodes[0] === start && nodes.at(-1) === end
    && start.location.lat === NORTH_POLE.lat && Math.abs(start.location.lng) === 180
    && end.location.lat === NORTH_POLE.lat && Math.abs(end.location.lng) === 180
    && start.location.country_code == null && end.location.country_code == null;
  addCheck(checks, 'North Pole start and end', northPoleEndpoints,
    start && end ? `${nodes.length} nodes begin at START and end at END.` : 'START or END node is missing.');
  const uniqueIds = new Set(view.delivery.map((node) => node.candidate_id)).size === view.delivery.length;
  addCheck(checks, 'Candidate identity', view.matched && uniqueIds,
    `${view.places.length}/${view.delivery.length} delivery nodes map to unique snapshot candidates.`);
  addRequiredStopCheck(context, view, checks);
  addMetadataCheck(document, context, checks);
}

function addRequiredStopCheck(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const routeIds = new Set(view.delivery.map((node) => node.candidate_id).filter((id): id is string => typeof id === 'string'));
  const missingStops = context.config.requiredStopIds.filter((id) => !routeIds.has(id));
  const countries = new Set(view.delivery.map((node) => node.location.country_code).filter((code): code is string => typeof code === 'string'));
  const missingCountries = context.config.requiredCountries.filter((code) => !countries.has(code));
  const detail = missingStops.length || missingCountries.length
    ? `Missing stop ids ${missingStops.join(', ') || 'none'}; missing countries ${missingCountries.join(', ') || 'none'}.`
    : `${context.config.requiredStopIds.length} required iconic stops and countries ${context.config.requiredCountries.join(', ')} are present.`;
  addCheck(checks, 'Required iconic and regional stops', missingStops.length === 0 && missingCountries.length === 0, detail);
}

function addMetadataCheck(document: unknown, context: RouteAuditContext, checks: AuditCheck[]): void {
  const meta = isRecord(document) && isRecord(document.meta) ? document.meta : {};
  const version = typeof meta.route_version === 'string' ? meta.route_version : 'missing';
  const generatedAt = typeof meta.generated_at === 'string' ? meta.generated_at : 'missing';
  const valid = version === '2026-draft-1' && generatedAt === context.config.generatedAt && Date.parse(generatedAt) <= Date.now();
  addCheck(checks, 'Committed version and timestamp', valid, `version ${version}; generated_at ${generatedAt}.`);
}

function countCoreHubs(view: AuditView, config: GeneratorConfig): number {
  return view.delivery.filter((node, index) => {
    const place = view.places[index];
    return node.comment === 'hub' && place !== undefined
      && (place.worldCity === true || (place.population ?? 0) >= config.hubPopulationCore);
  }).length;
}

function addCategoryChecks(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const categoryCounts = view.delivery.reduce<Record<string, number>>((counts, node) => {
    const category = node.comment ?? 'missing';
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {});
  const expected = allocateQuotas(context.config.total, context.config.weights);
  const mixMatches = Object.entries(expected).every(([category, count]) => categoryCounts[category] === count);
  const coreHubs = countCoreHubs(view, context.config);
  const allHubsMeetMinimum = view.delivery.every((node, index) => node.comment !== 'hub'
    || view.places[index]?.worldCity === true
    || (view.places[index]?.population ?? 0) >= context.config.hubPopulationMinimum);
  addCheck(checks, 'Stop count and category mix', view.delivery.length === context.config.total && mixMatches,
    `${view.delivery.length} stops; ${Object.entries(categoryCounts).map(([name, count]) => `${name} ${count}`).join(', ')}.`);
  addCheck(checks, 'Hub definition', allHubsMeetMinimum && coreHubs >= context.config.hubCoreMinimum,
    `${coreHubs} of ${categoryCounts.hub ?? 0} hubs meet world-city or ${context.config.hubPopulationCore.toLocaleString()}+ population; all hubs meet ${context.config.hubPopulationMinimum.toLocaleString()}+ population or world-city status.`);
}

function timezoneNodeIsComplete(node: RouteNode, place: Candidate | undefined): place is Candidate {
  return place !== undefined && node.schedule.arrival_utc !== null && node.location.timezone !== undefined && node.location.country_code !== undefined;
}

function timezoneCountryFailures(node: RouteNode, place: Candidate, context: RouteAuditContext): string[] {
  const country = node.location.country_code;
  const zone = node.location.timezone;
  const allowed = country ? context.zonesByCountry[country] ?? [] : [];
  if (country !== place.country || zone !== place.timezone || !allowed.includes(zone ?? '')) {
    return [`${node.location.name}: ${zone} is not an allowed ${country} timezone`];
  }
  return [];
}

function timezoneOffsetFailures(node: RouteNode, place: Candidate, context: RouteAuditContext): string[] {
  const zone = node.location.timezone ?? '';
  const zoneOffset = context.utcOffsetsByTimezone[zone];
  if (zoneOffset === undefined || zoneOffset !== place.utcOffsetMinutes) {
    return [`${node.location.name}: snapshot offset ${place.utcOffsetMinutes} differs from ${zone} offset ${zoneOffset ?? 'missing'}`];
  }
  return [];
}

function localArrivalFailures(node: RouteNode, place: Candidate, context: RouteAuditContext): string[] {
  const arrival = node.schedule.arrival_utc;
  if (!arrival) return [`${node.location.name}: missing arrival time`];
  const local = localMinute(arrival, place.utcOffsetMinutes ?? Number.NaN);
  const failures: string[] = [];
  if (local < 0) failures.push(`${node.location.name}: snapshot local arrival is not December 25`);
  if (local < context.config.arrivalStartMinute || local > context.config.arrivalEndMinute) failures.push(`${node.location.name}: outside the local arrival window`);
  return failures;
}

function displayOffsetFailures(node: RouteNode, place: Candidate): string[] {
  const displayOffset = node.location.timezone_offset;
  if (place.utcOffsetMinutes !== undefined && displayOffset !== undefined && displayOffset !== place.utcOffsetMinutes / 60) {
    return [`${node.location.name}: display offset differs from the snapshot`];
  }
  return [];
}

function timezoneFailuresForNode(node: RouteNode, place: Candidate | undefined, context: RouteAuditContext): string[] {
  if (!timezoneNodeIsComplete(node, place)) return [`${node.location.name}: missing candidate, time, country, or timezone`];
  return [
    ...timezoneCountryFailures(node, place, context),
    ...timezoneOffsetFailures(node, place, context),
    ...localArrivalFailures(node, place, context),
    ...displayOffsetFailures(node, place),
  ];
}

function addOffsetCoverageCheck(context: RouteAuditContext, counts: Map<number, number>, checks: AuditCheck[]): void {
  const veto = new Set(context.vetoIds);
  const eligible = new Set(context.pool.filter((place) => canBeSelected(place, context.config, veto))
    .map((place) => place.utcOffsetMinutes).filter((value): value is number => value !== undefined));
  const missing = [...eligible].filter((offset) => (counts.get(offset) ?? 0) < 1).sort((a, b) => a - b);
  const detail = missing.length
    ? `Missing ${missing.map(formatUtcOffset).join(', ')}.`
    : `${eligible.size} populated offsets represented; ${[...counts].sort(([a], [b]) => a - b).map(([offset, count]) => `${formatUtcOffset(offset)} ${count}`).join(', ')}.`;
  addCheck(checks, 'UTC offset coverage', missing.length === 0, detail);
}

function addTimezoneChecks(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const failures: string[] = [];
  const offsetCounts = new Map<number, number>();
  view.delivery.forEach((node, index) => {
    failures.push(...timezoneFailuresForNode(node, view.places[index], context));
    const offset = view.places[index]?.utcOffsetMinutes;
    if (offset !== undefined) offsetCounts.set(offset, (offsetCounts.get(offset) ?? 0) + 1);
  });
  addCheck(checks, 'Timezone and local Christmas arrivals', failures.length === 0,
    failures.length ? failures.slice(0, 6).join('; ')
      : `${view.delivery.length} stops match country zones, real IANA offsets, Dec 25, and 00:20–03:00 local.`);
  addOffsetCoverageCheck(context, offsetCounts, checks);
}

function addRegionalChecks(context: RouteAuditContext, places: Candidate[], checks: AuditCheck[]): void {
  const regions = places.map(classifyRegion);
  const count = (predicate: (region: (typeof regions)[number]) => boolean): number => regions.filter(predicate).length;
  const continentCounts = countsByRegion(regions, (region) => region.continent);
  const subregionCounts = countsByRegion(regions, (region) => region.subregion);
  const failures = sameCounts(continentCounts, context.report.continentBalance)
    && sameCounts(subregionCounts, context.report.subregionBalance) ? [] : ['audit, report, and review region counts disagree'];
  const tests: [string, number, number][] = [
    ['Western and Northern Europe', count((region) => region.westernNorthernEurope), context.config.regionalMinimums.westernNorthernEurope],
    ['Australia and New Zealand', count((region) => region.australiaNewZealand), context.config.regionalMinimums.australiaNewZealand],
    ['Pacific islands', count((region) => region.pacificIsland), context.config.regionalMinimums.pacificIslands],
    ['Africa', count((region) => region.africa), context.config.regionalMinimums.africa],
    ['Middle East', count((region) => region.middleEast), context.config.regionalMinimums.middleEast],
    ['Greenland or Arctic Canada', count((region) => region.arctic), context.config.regionalMinimums.arctic],
  ];
  for (const [name, actual, minimum] of tests) if (actual < minimum) failures.push(`${name} ${actual}/${minimum}`);
  const americas = count((region) => region.americas);
  const southAmerica = count((region) => region.southAmerica);
  const bolivia = places.filter((place) => place.country === 'BO').length;
  addRegionCaps(failures, context, americas, southAmerica, bolivia);
  const detail = failures.length ? failures.join('; ')
    : `${tests.map(([name, amount]) => `${name} ${amount}`).join(', ')}; Americas ${americas}/${context.config.total} (${(americas / context.config.total * 100).toFixed(1)}%), South America ${southAmerica}, Bolivia ${bolivia}.`;
  addCheck(checks, 'Regional quotas and Americas caps', failures.length === 0, detail);
}

function addRegionCaps(failures: string[], context: RouteAuditContext, americas: number, southAmerica: number, bolivia: number): void {
  const maximumAmericas = Math.floor(context.config.total * context.config.maxAmericasPercent / 100);
  if (americas > maximumAmericas) failures.push(`Americas ${americas}/${maximumAmericas}`);
  if (southAmerica > context.config.maxSouthAmericaStops) failures.push(`South America ${southAmerica}/${context.config.maxSouthAmericaStops}`);
  const boliviaCap = context.config.countryCaps.BO ?? 4;
  if (bolivia > boliviaCap) failures.push(`Bolivia ${bolivia}/${boliviaCap}`);
}

function longestCountryRun(places: Candidate[]): number {
  let longest = 0;
  let run = 0;
  let previous: string | undefined;
  for (const place of places) {
    run = place.country === previous ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = place.country;
  }
  return longest;
}

function addCountryChecks(context: RouteAuditContext, places: Candidate[], checks: AuditCheck[]): void {
  const counts = new Map<string, number>();
  for (const place of places) counts.set(place.country, (counts.get(place.country) ?? 0) + 1);
  const overCaps = [...counts].filter(([country, count]) => count > (context.config.countryCaps[country] ?? context.config.maxStopsPerCountry));
  const maxRun = longestCountryRun(places);
  addCheck(checks, 'Country totals and consecutive runs', overCaps.length === 0 && maxRun <= context.config.maxCountryRun,
    `maximum country total ${Math.max(...counts.values())}; longest run ${maxRun}; limits ${context.config.maxStopsPerCountry} and ${context.config.maxCountryRun}.`);
}

function minimumSeparationKm(places: Candidate[]): number {
  if (places.length <= 1) return Number.POSITIVE_INFINITY;
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < places.length; left++) {
    for (let right = left + 1; right < places.length; right++) {
      const first = places[left];
      const second = places[right];
      if (first && second) minimum = Math.min(minimum, haversineKm(first, second));
    }
  }
  return minimum;
}

function addCoordinateChecks(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const coordinateProblems = coordinateAuditFailures(view.places, context.pool, context.countryBoundsByCode);
  const vetoed = view.delivery.filter((node) => node.candidate_id && context.vetoIds.includes(node.candidate_id)).map((node) => node.location.name);
  const names = new Set(view.delivery.map((node) => `${node.location.name.trim().toLocaleLowerCase('en')}:${node.location.country_code}`));
  const coords = new Set(view.delivery.map((node) => `${node.location.lat.toFixed(5)},${node.location.lng.toFixed(5)}`));
  const duplicateCount = view.delivery.length - names.size + view.delivery.length - coords.size;
  const minSeparation = minimumSeparationKm(view.places);
  const vetoNames = ['Dzhankoy', 'Kursk', 'Zelenodolsk', 'Bikini Atoll', 'Point Barrow'];
  const vetoNameStops = view.delivery.filter((node) => vetoNames.includes(node.location.name));
  const pass = vetoed.length === 0 && vetoNameStops.length === 0 && coordinateProblems.length === 0
    && duplicateCount === 0 && minSeparation >= context.config.minStopSeparationKm;
  const detail = vetoed.length || vetoNameStops.length ? `Vetoed stop: ${[...vetoNames, ...vetoed].join(', ')}.`
    : coordinateProblems.length ? coordinateProblems.slice(0, 4).join('; ')
      : `country bounds and cross-source name coordinates pass; no duplicates; nearest pair ${human(minSeparation)} km apart (minimum ${context.config.minStopSeparationKm} km).`;
  addCheck(checks, 'Vetoes, coordinates, duplicates, and separation', pass, detail);
}

function addIslandCheck(context: RouteAuditContext, places: Candidate[], checks: AuditCheck[]): void {
  const islandIndices = places.flatMap((place, index) => context.config.uninhabitedIslandIds.includes(place.id) ? [index] : []);
  const firstFivePopulated = places.slice(0, 5).every((place) => (place.population ?? 0) > 0
    || place.worldCity === true || context.config.openingStopIds.includes(place.id));
  const last = places.at(-1);
  const lastPopulated = !!last && ((last.population ?? 0) > 0 || last.worldCity === true || context.config.requiredStopIds.includes(last.id));
  const pass = islandIndices.length <= 4 && islandIndices.every((index) => index >= 5) && firstFivePopulated && lastPopulated;
  const detail = `${islandIndices.length} uninhabited-island stops; first five ${firstFivePopulated ? 'populated' : 'include an unpopulated place'}; last stop ${last?.name ?? 'missing'} ${lastPopulated ? 'is populated or iconic' : 'is not populated or iconic'}.`;
  addCheck(checks, 'Island, opening, and ending rules', pass, detail);
}

function addExperienceCheck(view: AuditView, checks: AuditCheck[]): void {
  const sourceFailures = view.delivery.filter((node) => !isTrustedSource(node.notes));
  const experienceFailures = view.delivery.filter((node) => node.stop_experience?.presents_delivered_at_stop !== 1
    || node.stop_experience.camera_zoom == null || !node.stop_experience.weather_condition);
  const transitFailures = view.nodes.filter((node) => node.type !== 'START' && (node.transit_to_here?.duration_seconds == null
    || node.transit_to_here?.distance_km == null || node.transit_to_here?.speed_kmh == null));
  addCheck(checks, 'Source links and stop experience', sourceFailures.length === 0 && experienceFailures.length === 0 && transitFailures.length === 0,
    `${sourceFailures.length} missing source links; ${experienceFailures.length} incomplete delivery experiences; ${transitFailures.length} missing transit metrics.`);
}

function addUnmatchedSelectionChecks(checks: AuditCheck[]): void {
  const names = ['Stop count and category mix', 'Hub definition', 'Timezone and local Christmas arrivals', 'UTC offset coverage',
    'Regional quotas and Americas caps', 'Country totals and consecutive runs', 'Vetoes, coordinates, duplicates, and separation',
    'Island, opening, and ending rules', 'Source links and stop experience'];
  for (const name of names) addCheck(checks, name, false, 'Cannot check without unique candidate matches.');
}

function addSelectionChecks(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  if (!view.matched) {
    addUnmatchedSelectionChecks(checks);
    return;
  }
  addCategoryChecks(context, view, checks);
  addTimezoneChecks(context, view, checks);
  addRegionalChecks(context, view.places, checks);
  addCountryChecks(context, view.places, checks);
  addCoordinateChecks(context, view, checks);
  addIslandCheck(context, view.places, checks);
  addExperienceCheck(view, checks);
}

function addFlightWindowCheck(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const takeoff = Date.parse(TAKEOFF_UTC);
  const lastDeparture = Date.parse(view.delivery.at(-1)?.schedule.departure_utc ?? '');
  const returnArrival = Date.parse(view.end?.schedule.arrival_utc ?? '');
  const pass = !!view.start && !!view.end && lastDeparture <= takeoff + 27 * 3_600_000
    && returnArrival <= takeoff + 27 * 3_600_000 + 45 * 60_000;
  addCheck(checks, 'Flight window and North Pole return', pass,
    `last delivery departs ${Number.isFinite(lastDeparture) ? new Date(lastDeparture).toISOString() : 'invalid'}; return ${Number.isFinite(returnArrival) ? new Date(returnArrival).toISOString() : 'invalid'}.`);
}

function addDeliveryLegs(legs: AuditLeg[], view: AuditView): void {
  for (let index = 1; index < view.places.length; index++) {
    const from = view.places[index - 1];
    const to = view.places[index];
    const fromNode = view.delivery[index - 1];
    const toNode = view.delivery[index];
    if (!from || !to || !fromNode || !toNode) continue;
    const fromDeparture = Date.parse(fromNode.schedule.departure_utc);
    const toArrival = Date.parse(toNode.schedule.arrival_utc ?? '');
    const gapSeconds = (toArrival - fromDeparture) / 1000;
    const gapMinutes = (toArrival - Date.parse(fromNode.schedule.arrival_utc ?? '')) / 60_000;
    const eastward = ((to.lng - from.lng + 540) % 360) - 180;
    const km = haversineKm(from, to);
    legs.push({ km, kmh: legSpeedKmh(from, to, gapSeconds) ?? 0, gapMinutes, eastward, kind: 'delivery' });
  }
}

function buildAuditLegs(view: AuditView, takeoff: number): AuditLeg[] {
  const legs: AuditLeg[] = [];
  const firstNode = view.delivery[0];
  const firstPlace = view.places[0];
  if (firstNode && firstPlace) {
    const arrival = Date.parse(firstNode.schedule.arrival_utc ?? '');
    const gapMinutes = (arrival - takeoff) / 60_000;
    const km = haversineKm(NORTH_POLE, firstPlace);
    legs.push({ km, kmh: legSpeedKmh(NORTH_POLE, firstPlace, gapMinutes * 60) ?? 0, gapMinutes, eastward: 0, kind: 'launch' });
  }
  addDeliveryLegs(legs, view);
  addReturnLeg(legs, view);
  return legs;
}

function addReturnLeg(legs: AuditLeg[], view: AuditView): void {
  const lastPlace = view.places.at(-1);
  const lastNode = view.delivery.at(-1);
  if (!lastPlace || !lastNode || !view.end) return;
  const fromDeparture = Date.parse(lastNode.schedule.departure_utc);
  const returnArrival = Date.parse(view.end.schedule.arrival_utc ?? '');
  const gapSeconds = (returnArrival - fromDeparture) / 1000;
  const km = haversineKm(lastPlace, NORTH_POLE);
  legs.push({ km, kmh: legSpeedKmh(lastPlace, NORTH_POLE, gapSeconds) ?? 0, gapMinutes: gapSeconds / 60, eastward: 0, kind: 'return' });
}

function addArrivalGapCheck(context: RouteAuditContext, view: AuditView, legs: AuditLeg[], checks: AuditCheck[]): void {
  const arrivals = view.delivery.map((node) => Date.parse(node.schedule.arrival_utc ?? ''));
  const gaps = arrivals.slice(1).map((arrival, index) => (arrival - (arrivals[index] ?? arrival)) / 60_000);
  const badGaps = gaps.filter((gap) => gap < context.config.minArrivalGapMinutes || gap > context.config.maxArrivalGapMinutes);
  const maxGap = gaps.length ? Math.max(...gaps) : 0;
  const returnLeg = legs.at(-1);
  const pass = badGaps.length === 0 && maxGap <= context.config.maxArrivalGapMinutes && !!returnLeg && returnLeg.gapMinutes <= 60;
  const detail = `arrival gaps ${gaps.length ? `${human(Math.min(...gaps))}–${human(maxGap)} min` : 'missing'}; return gap ${human(returnLeg?.gapMinutes ?? Number.POSITIVE_INFINITY)} min.`;
  addCheck(checks, 'Arrival pacing and quiet gaps', pass, detail);
}

function addClockHourCheck(context: RouteAuditContext, view: AuditView, takeoff: number, checks: AuditCheck[]): void {
  const hourly = new Map<number, number>();
  const arrivals = view.delivery.map((node) => Date.parse(node.schedule.arrival_utc ?? ''));
  for (const arrival of arrivals) {
    const hour = Math.floor((arrival - takeoff) / 3_600_000);
    hourly.set(hour, (hourly.get(hour) ?? 0) + 1);
  }
  const finalHour = Math.floor(((arrivals.at(-1) ?? takeoff) - takeoff) / 3_600_000);
  const thinHours = Array.from({ length: Math.max(0, finalHour - 1) }, (_, index) => index + 1)
    .filter((hour) => (hourly.get(hour) ?? 0) < context.config.minimumStopsPerHour);
  const detail = thinHours.length
    ? `under ${context.config.minimumStopsPerHour} stops in UTC flight hours ${thinHours.join(', ')}.`
    : `at least ${context.config.minimumStopsPerHour} stops in each complete interior UTC flight hour.`;
  addCheck(checks, 'Clock-hour coverage', thinHours.length === 0, detail);
}

function addSpeedCheck(context: RouteAuditContext, view: AuditView, legs: AuditLeg[], checks: AuditCheck[]): void {
  const speeds = legs.map((leg) => leg.kmh);
  const median = percent(speeds, 0.5);
  const p90 = percent(speeds, 0.9);
  const maximum = Math.max(...speeds);
  const transitSpeeds = view.nodes.filter((node) => node.type !== 'START')
    .map((node) => node.transit_to_here?.speed_kmh).filter((speed): speed is number => speed !== undefined && speed !== null);
  const reportedMaximum = transitSpeeds.length ? Math.max(...transitSpeeds) : Number.POSITIVE_INFINITY;
  const pass = median >= context.config.medianLegSpeedMinKmh && median <= context.config.medianLegSpeedMaxKmh
    && p90 <= context.config.p90LegSpeedMaxKmh && maximum <= context.config.maxLegSpeedKmh && reportedMaximum <= context.config.maxLegSpeedKmh;
  addCheck(checks, 'Leg-speed targets', pass,
    `median ${human(median)} km/h; p90 ${human(p90)} km/h; max ${human(maximum)} km/h calculated and ${human(reportedMaximum)} km/h stored.`);
}

function addDistanceCheck(context: RouteAuditContext, legs: AuditLeg[], checks: AuditCheck[]): void {
  const pathKm = legs.reduce((sum, leg) => sum + leg.km, 0);
  const eastward = legs.filter((leg) => leg.kind === 'delivery' && leg.eastward > 8).length;
  addCheck(checks, 'Route length and eastward backtracking', pathKm <= context.config.maxRouteDistanceKm && eastward <= 3,
    `${human(pathKm)} km total including launch and return; ${eastward} delivery legs move east more than 8°.`);
}

function addPacingChecks(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const usable = view.matched && !!view.start && !!view.end && view.delivery.length === view.places.length && view.places.length > 0;
  if (!usable) {
    addCheck(checks, 'Arrival pacing and quiet gaps', false, 'Cannot calculate paced legs.');
    addCheck(checks, 'Clock-hour coverage', false, 'Cannot calculate hourly stop counts.');
    addCheck(checks, 'Leg-speed targets', false, 'Cannot calculate leg speeds.');
    addCheck(checks, 'Route length and eastward backtracking', false, 'Cannot calculate the path.');
    return;
  }
  const takeoff = Date.parse(TAKEOFF_UTC);
  const legs = buildAuditLegs(view, takeoff);
  addArrivalGapCheck(context, view, legs, checks);
  addClockHourCheck(context, view, takeoff, checks);
  addSpeedCheck(context, view, legs, checks);
  addDistanceCheck(context, legs, checks);
}

export function auditRouteDocument(document: unknown, context: RouteAuditContext): AuditResult {
  const checks: AuditCheck[] = [];
  const view = createAuditView(document, context);
  addHeaderChecks(document, context, view, checks);
  addSelectionChecks(context, view, checks);
  addFlightWindowCheck(context, view, checks);
  addPacingChecks(context, view, checks);
  return { checks, pass: checks.every((check) => check.pass) };
}
