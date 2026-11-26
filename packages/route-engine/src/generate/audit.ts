import { LegacyRouteFixtureSchema } from '@santa-tracker/contracts';
import { haversineKm, legSpeedKmh } from '../geo';
import { classifyRegion } from './regions';
import { REQUIRED_ADMIN1_UNITS } from './admin1';
import { NORTH_POLE, TAKEOFF_UTC, type Candidate, type GeneratorConfig, type RouteReport } from './types';

export type AuditCheck = { name: string; pass: boolean; detail: string };
export type AuditResult = { checks: AuditCheck[]; reports: { name: string; detail: string }[]; pass: boolean };

export type RouteAuditContext = {
  config: GeneratorConfig;
  pool: Candidate[];
  selected: Candidate[];
  zonesByCountry: Record<string, string[]>;
  utcOffsetsByTimezone: Record<string, number>;
  countryBoundsByCode: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }>;
  report: Pick<RouteReport, 'continentBalance' | 'subregionBalance'> & Partial<Pick<RouteReport, 'uncoveredCountryReasons'>>;
  vetoIds: string[];
  worldPlaces?: Candidate[];
};

type RouteNode = {
  id: string;
  type: string;
  candidate_id?: string;
  name?: string;
  label?: string;
  comment?: string;
  location: {
    name: string;
    label?: string;
    country_code?: string;
    admin1_code?: string | null;
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
  stop_experience?: { presents_delivered_at_stop?: number | null; camera_zoom?: number | null; weather_condition?: string | null; stop_tier?: string | null; duration_seconds?: number | null };
  transit_to_here?: { duration_seconds?: number | null; distance_km?: number | null; speed_kmh?: number | null; eastward_reason?: 'dateline' | 'offset-anomaly' | 'return' | null } | null;
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

type AuditView = {
  nodes: RouteNode[];
  delivery: RouteNode[];
  start?: RouteNode;
  end?: RouteNode;
  matched: boolean;
  places: Candidate[];
};

type AuditLeg = { km: number; kmh: number; gapMinutes: number; eastward: number; kind: string; fromName: string; toName: string; toNode?: RouteNode };

function addCheck(checks: AuditCheck[], name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
}

function addNameAndRegionCheck(view: AuditView, checks: AuditCheck[]): void {
  const failures: string[] = [];
  const mappedCountries = new Set<string>();
  for (const node of view.nodes) {
    const labels = [node.location.name, node.location.label, node.name, node.label];
    for (const label of labels) {
      if (typeof label === 'string' && /[?\uFFFD]/u.test(label)) {
        failures.push(`${node.location.name}: a name or label contains '?' or U+FFFD`);
      }
    }

    const country = node.location.country_code;
    if (!country) continue;
    try {
      classifyRegion({
        id: node.candidate_id ?? node.id,
        name: node.location.name,
        country,
        lat: node.location.lat,
        lng: node.location.lng,
        timezone: node.location.timezone ?? '',
        category: node.comment ?? '',
      });
      mappedCountries.add(country);
    } catch {
      failures.push(`${node.location.name}: no explicit continent and subregion mapping for ${country}`);
    }
  }

  const pass = view.delivery.length > 0 && failures.length === 0;
  const detail = failures.length
    ? failures.slice(0, 8).join('; ')
    : `${view.delivery.length} delivery names and labels are clean; ${mappedCountries.size} route country codes map to explicit regions.`;
  addCheck(checks, 'Clean names and explicit region mappings', pass, detail);
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
  addLegacySchemaCheck(document, checks);
  addEndpointCheck(view, checks);
  addCandidateIdentityCheck(view, checks);
  addMetadataCheck(document, context, checks);
}

function addLegacySchemaCheck(document: unknown, checks: AuditCheck[]): void {
  const validFixture = LegacyRouteFixtureSchema.safeParse(document).success;
  addCheck(checks, 'Legacy route schema', validFixture, validFixture ? 'Legacy route fixture parses.' : 'Legacy route fixture does not parse.');
}

function isNorthPoleNode(node: RouteNode | undefined): boolean {
  if (!node) return false;
  return node.location.lat === NORTH_POLE.lat && Math.abs(node.location.lng) === 180;
}

function hasNeutralCountryCode(node: RouteNode): boolean {
  return node.location.country_code == null;
}

function hasNorthPoleEndpoints(view: AuditView): boolean {
  const { nodes, start, end } = view;
  if (!start) return false;
  if (!end) return false;
  if (nodes[0] !== start || nodes.at(-1) !== end) return false;
  return isNorthPoleNode(start) && isNorthPoleNode(end) && hasNeutralCountryCode(start) && hasNeutralCountryCode(end);
}

function addEndpointCheck(view: AuditView, checks: AuditCheck[]): void {
  const { nodes, start, end } = view;
  const northPoleEndpoints = hasNorthPoleEndpoints(view);
  addCheck(checks, 'North Pole start and end', northPoleEndpoints,
    start && end ? `${nodes.length} nodes begin at START and end at END.` : 'START or END node is missing.');
}

function addCandidateIdentityCheck(view: AuditView, checks: AuditCheck[]): void {
  const uniqueIds = new Set(view.delivery.map((node) => node.candidate_id)).size === view.delivery.length;
  addCheck(checks, 'Candidate identity', view.matched && uniqueIds,
    `${view.places.length}/${view.delivery.length} delivery nodes map to unique snapshot candidates.`);
}

function addMetadataCheck(document: unknown, context: RouteAuditContext, checks: AuditCheck[]): void {
  const meta = isRecord(document) && isRecord(document.meta) ? document.meta : {};
  const version = typeof meta.route_version === 'string' ? meta.route_version : 'missing';
  const generatedAt = typeof meta.generated_at === 'string' ? meta.generated_at : 'missing';
  const valid = version === '2026-draft-1' && generatedAt === context.config.generatedAt && Date.parse(generatedAt) <= Date.now();
  addCheck(checks, 'Committed version and timestamp', valid, `version ${version}; generated_at ${generatedAt}.`);
}

function timezoneNodeIsComplete(node: RouteNode, place: Candidate | undefined): place is Candidate {
  if (!place) return false;
  if (node.schedule.arrival_utc === null) return false;
  if (!node.location.timezone) return false;
  return node.location.country_code !== undefined;
}

function timezoneCountryFailures(node: RouteNode, place: Candidate, context: RouteAuditContext): string[] {
  const country = node.location.country_code;
  const zone = node.location.timezone;
  const allowed = country ? context.zonesByCountry[country] ?? [] : [];
  if (!matchesCandidateCountry(country, place)) return timezoneCountryError(node, country, zone);
  if (!matchesCandidateTimezone(zone, place)) return timezoneCountryError(node, country, zone);
  if (!isAllowedTimezone(zone, allowed)) return timezoneCountryError(node, country, zone);
  return [];
}

function matchesCandidateCountry(country: string | undefined, place: Candidate): boolean {
  return country === place.country;
}

function matchesCandidateTimezone(zone: string | undefined, place: Candidate): boolean {
  return zone === place.timezone;
}

function isAllowedTimezone(zone: string | undefined, allowed: string[]): boolean {
  return allowed.includes(zone ?? '');
}

function timezoneCountryError(node: RouteNode, country: string | undefined, zone: string | undefined): string[] {
  return [`${node.location.name}: ${zone} is not an allowed ${country} timezone`];
}

function timezoneOffsetFailures(node: RouteNode, place: Candidate, context: RouteAuditContext): string[] {
  const zone = node.location.timezone ?? '';
  const zoneOffset = context.utcOffsetsByTimezone[zone];
  if (zoneOffset === undefined || zoneOffset !== place.utcOffsetMinutes) {
    return [`${node.location.name}: snapshot offset ${place.utcOffsetMinutes} differs from ${zone} offset ${zoneOffset ?? 'missing'}`];
  }
  return [];
}

function localArrivalFailures(node: RouteNode, place: Candidate): string[] {
  const arrival = node.schedule.arrival_utc;
  if (!arrival) return [`${node.location.name}: missing arrival time`];
  const offset = place.utcOffsetMinutes;
  if (offset === undefined) return [`${node.location.name}: missing snapshot UTC offset`];
  const local = new Date(Date.parse(arrival) + offset * 60_000);
  const day = local.getUTCDate();
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const validDate = local.getUTCFullYear() === 2026 && local.getUTCMonth() === 11;
  const inWindow = (day === 24 && minute >= 23 * 60) || (day === 25 && minute <= 5 * 60);
  return validDate && inWindow ? [] : [`${node.location.name}: local arrival is outside Dec 24 23:00–Dec 25 05:00`];
}

function displayOffsetFailures(node: RouteNode, place: Candidate): string[] {
  const displayOffset = node.location.timezone_offset;
  if (place.utcOffsetMinutes === undefined) return [];
  if (displayOffset === undefined) return [];
  if (displayOffset === place.utcOffsetMinutes / 60) return [];
  return [`${node.location.name}: display offset differs from the snapshot`];
}

function timezoneFailuresForNode(node: RouteNode, place: Candidate | undefined, context: RouteAuditContext): string[] {
  if (!timezoneNodeIsComplete(node, place)) return [`${node.location.name}: missing candidate, time, country, or timezone`];
  return [
    ...timezoneCountryFailures(node, place, context),
    ...timezoneOffsetFailures(node, place, context),
    ...localArrivalFailures(node, place),
    ...displayOffsetFailures(node, place),
  ];
}

function addTimezoneChecks(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const failures: string[] = [];
  view.delivery.forEach((node, index) => {
    failures.push(...timezoneFailuresForNode(node, view.places[index], context));
  });
  addCheck(checks, 'Timezone and local arrival window', failures.length === 0,
    failures.length ? failures.slice(0, 6).join('; ')
      : `${view.delivery.length} stops match country zones and arrive between 23:00 Dec 24 and 05:00 Dec 25 local.`);
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

function duplicateStopCount(delivery: RouteNode[]): number {
  const names = new Set(delivery.map((node) => `${node.location.name.trim().toLocaleLowerCase('en')}:${node.location.country_code}`));
  const coords = new Set(delivery.map((node) => `${node.location.lat.toFixed(5)},${node.location.lng.toFixed(5)}`));
  return delivery.length - names.size + delivery.length - coords.size;
}

function vetoedRouteStops(view: AuditView, context: RouteAuditContext): RouteNode[] {
  return view.delivery.filter((node) => node.candidate_id && context.vetoIds.includes(node.candidate_id));
}

type CoordinateAuditSummary = {
  vetoed: string[];
  vetoNameStops: RouteNode[];
  coordinateProblems: string[];
  duplicateCount: number;
  minSeparation: number;
  minimumDistance: number;
};

function coordinateRulesPass({ vetoed, vetoNameStops, coordinateProblems, duplicateCount, minSeparation, minimumDistance }: CoordinateAuditSummary): boolean {
  if (vetoed.length > 0) return false;
  if (vetoNameStops.length > 0) return false;
  if (coordinateProblems.length > 0) return false;
  if (duplicateCount > 0) return false;
  return minSeparation >= minimumDistance;
}

function addCoordinateChecks(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const coordinateProblems = coordinateAuditFailures(view.places, context.pool, context.countryBoundsByCode);
  const vetoed = vetoedRouteStops(view, context).map((node) => node.location.name);
  const duplicateCount = duplicateStopCount(view.delivery);
  const minSeparation = minimumSeparationKm(view.places);
  const vetoNames = ['Dzhankoy', 'Kursk', 'Zelenodolsk', 'Bikini Atoll', 'Point Barrow'];
  const vetoNameStops = view.delivery.filter((node) => vetoNames.includes(node.location.name));
  const minimumDistance = 20;
  const pass = coordinateRulesPass({ vetoed, vetoNameStops, coordinateProblems, duplicateCount, minSeparation, minimumDistance });
  const detail = vetoed.length || vetoNameStops.length ? `Vetoed stop: ${[...vetoNames, ...vetoed].join(', ')}.`
    : coordinateProblems.length ? coordinateProblems.slice(0, 4).join('; ')
      : `country bounds and cross-source name coordinates pass; no duplicates; nearest pair ${human(minSeparation)} km apart (minimum ${minimumDistance} km).`;
  addCheck(checks, 'Vetoes, coordinates, duplicates, and separation', pass, detail);
}

function addExperienceCheck(view: AuditView, checks: AuditCheck[]): void {
  const sourceFailures = view.delivery.filter(hasMissingSource);
  const experienceFailures = view.delivery.filter(hasIncompleteExperience);
  const transitFailures = view.nodes.filter(hasMissingTransitMetrics);
  addCheck(checks, 'Tone veto, sources, and stop experience', sourceFailures.length === 0 && experienceFailures.length === 0 && transitFailures.length === 0,
    `${sourceFailures.length} missing source links; ${experienceFailures.length} incomplete delivery experiences; ${transitFailures.length} missing transit metrics.`);
}

const STOP_TIER_SECONDS: Record<string, number> = { major: 60, city: 30, town: 10, hop: 3 };

function expectedTier(place: Candidate): string {
  const population = place.population;
  const capital = place.category === 'capital' || ('isNationalCapital' in place && place.isNationalCapital === true);
  const curated = ['cultural', 'nature', 'special'].includes(place.category);
  const headline = place.category === 'special' || ('headlineLandmark' in place && place.headlineLandmark === true);
  if (population === undefined) return headline ? 'major' : curated || capital ? 'city' : 'hop';
  if (population >= 1_000_000 || (capital && population >= 250_000) || headline) return 'major';
  if (population >= 100_000 || capital || curated) return 'city';
  if (population >= 5_000) return 'town';
  return 'hop';
}

function addStopTierCheck(view: AuditView, checks: AuditCheck[]): void {
  const counts: Record<string, number> = {};
  const failures: string[] = [];
  view.delivery.forEach((node, index) => {
    const tier = node.stop_experience?.stop_tier ?? '';
    counts[tier || 'missing'] = (counts[tier || 'missing'] ?? 0) + 1;
    const expectedSeconds = STOP_TIER_SECONDS[tier];
    const duration = node.stop_experience?.duration_seconds ?? undefined;
    const place = view.places[index];
    const expected = place ? expectedTier(place) : undefined;
    if (expectedSeconds === undefined || duration !== expectedSeconds || (expected !== undefined && tier !== expected)) {
      failures.push(`${node.location.name}: tier ${tier || 'missing'}, duration ${duration ?? 'missing'}s${expected ? `, expected ${expected}` : ''}`);
    }
  });
  addCheck(checks, 'Stop tiers and duration', failures.length === 0,
    `${failures.length ? failures.slice(0, 6).join('; ') : 'all DELIVERY stops have a valid tier and matching duration'}; counts ${Object.entries(counts).map(([tier, count]) => `${tier} ${count}`).join(', ')}.`);
}

function hasMissingSource(node: RouteNode): boolean {
  return !isTrustedSource(node.notes);
}

function hasIncompleteExperience(node: RouteNode): boolean {
  const experience = node.stop_experience;
  if (experience?.presents_delivered_at_stop !== 1) return true;
  if (experience.camera_zoom == null) return true;
  return !experience.weather_condition;
}

function hasMissingTransitMetrics(node: RouteNode): boolean {
  if (node.type === 'START') return false;
  const transit = node.transit_to_here;
  if (transit?.duration_seconds == null) return true;
  if (transit.distance_km == null) return true;
  return transit.speed_kmh == null;
}

function addUnmatchedSelectionChecks(checks: AuditCheck[]): void {
  const names = ['Timezone and local arrival window', 'Vetoes, coordinates, duplicates, and separation',
    'Stop tiers and duration'];
  for (const name of names) addCheck(checks, name, false, 'Cannot check without unique candidate matches.');
}

function addSelectionChecks(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  if (!view.matched) {
    addUnmatchedSelectionChecks(checks);
    return;
  }
  addTimezoneChecks(context, view, checks);
  addCoordinateChecks(context, view, checks);
  addExperienceCheck(view, checks);
  addStopTierCheck(view, checks);
  addCountryCoverageCheck(context, view, checks);
  addAdmin1CoverageCheck(view, checks);
}

function addCountryCoverageCheck(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const available = [...new Set(context.pool.map((place) => place.country))].sort();
  const covered = new Set(view.places.map((place) => place.country));
  const omitted = available.filter((code) => !covered.has(code));
  const reasons = new Map((context.report.uncoveredCountryReasons ?? []).map((entry) => [entry.code, entry]));
  const undocumented = omitted.filter((code) => !(reasons.get(code)?.reason.trim())
    || (reasons.get(code)?.candidateCount ?? 0) < 1);
  addCheck(checks, 'Country and territory coverage', undocumented.length === 0,
    omitted.length === 0 ? `${available.length}/${available.length} candidate countries and territories covered.`
      : `${available.length - omitted.length}/${available.length} covered; omissions ${omitted.map((code) => `${code} (${reasons.get(code)?.reason ?? 'no reason recorded'})`).join('; ')}.`);
}

function addAdmin1CoverageCheck(view: AuditView, checks: AuditCheck[]): void {
  const required = new Set<string>(Object.values(REQUIRED_ADMIN1_UNITS).flatMap((codes) => [...codes]));
  const covered = new Set<string>();
  const mismatches: string[] = [];
  view.delivery.forEach((node, index) => {
    const place = view.places[index];
    if (!place || !['US', 'CA', 'AU'].includes(place.country)) return;
    const actual = node.location.admin1_code ?? undefined;
    const expected = place.admin1Code ?? undefined;
    if (actual !== expected) mismatches.push(`${node.location.name}: route admin1 ${actual ?? 'missing'} differs from candidate ${expected ?? 'missing'}`);
    if (actual && required.has(actual)) covered.add(actual);
  });
  const missing = [...required].filter((code) => !covered.has(code));
  const failures = [...mismatches, ...(missing.length ? [`uncovered ${missing.join(', ')}`] : [])];
  const us = REQUIRED_ADMIN1_UNITS.US.filter((code) => covered.has(code)).length;
  const ca = REQUIRED_ADMIN1_UNITS.CA.filter((code) => covered.has(code)).length;
  const au = REQUIRED_ADMIN1_UNITS.AU.filter((code) => covered.has(code)).length;
  addCheck(checks, 'US/Canada/Australia admin-1 coverage', failures.length === 0,
    failures.length ? failures.slice(0, 12).join('; ')
      : `US ${us}/${REQUIRED_ADMIN1_UNITS.US.length}, Canada ${ca}/${REQUIRED_ADMIN1_UNITS.CA.length}, Australia ${au}/${REQUIRED_ADMIN1_UNITS.AU.length}; route codes match candidate metadata.`);
}

function addFlightWindowCheck(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const takeoff = Date.parse(TAKEOFF_UTC);
  const lastDeparture = Date.parse(view.delivery.at(-1)?.schedule.departure_utc ?? '');
  const returnArrival = Date.parse(view.end?.schedule.arrival_utc ?? '');
  const pass = !!view.start && !!view.end && lastDeparture <= takeoff + 28 * 3_600_000
    && returnArrival <= takeoff + 28 * 3_600_000;
  addCheck(checks, 'Flight window and North Pole return', pass,
    `last delivery departs ${Number.isFinite(lastDeparture) ? new Date(lastDeparture).toISOString() : 'invalid'}; return ${Number.isFinite(returnArrival) ? new Date(returnArrival).toISOString() : 'invalid'}.`);
}

function deliveryLegAt(view: AuditView, index: number): AuditLeg | undefined {
  const legContext = deliveryLegContextAt(view, index);
  if (!legContext) return undefined;
  const { from, to, fromNode, toNode } = legContext;
  const fromDeparture = Date.parse(fromNode.schedule.departure_utc);
  const toArrival = Date.parse(toNode.schedule.arrival_utc ?? '');
  const gapSeconds = (toArrival - fromDeparture) / 1000;
  const gapMinutes = (toArrival - Date.parse(fromNode.schedule.arrival_utc ?? '')) / 60_000;
  const eastward = unwrapEastwardDelta(from.lng, to.lng);
  const km = haversineKm(from, to);
  return { km, kmh: legSpeedKmh(from, to, gapSeconds) ?? 0, gapMinutes, eastward, kind: 'delivery', fromName: fromNode.location.name, toName: toNode.location.name, toNode };
}

function unwrapEastwardDelta(fromLng: number, toLng: number): number {
  let delta = toLng - fromLng;
  while (delta > 180) delta -= 360;
  while (delta <= -180) delta += 360;
  return delta;
}

function normalizedLongitude(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

type AuditDeliveryLegContext = {
  from: Candidate;
  to: Candidate;
  fromNode: RouteNode;
  toNode: RouteNode;
};

function deliveryLegContextAt(view: AuditView, index: number): AuditDeliveryLegContext | undefined {
  const from = view.places[index - 1];
  if (!from) return undefined;
  const to = view.places[index];
  if (!to) return undefined;
  const fromNode = view.delivery[index - 1];
  if (!fromNode) return undefined;
  const toNode = view.delivery[index];
  if (!toNode) return undefined;
  return { from, to, fromNode, toNode };
}

function addDeliveryLegs(legs: AuditLeg[], view: AuditView): void {
  for (let index = 1; index < view.places.length; index++) {
    const leg = deliveryLegAt(view, index);
    if (leg) legs.push(leg);
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
    legs.push({ km, kmh: legSpeedKmh(NORTH_POLE, firstPlace, gapMinutes * 60) ?? 0, gapMinutes, eastward: 0, kind: 'launch', fromName: 'START', toName: firstNode.location.name, toNode: firstNode });
  }
  addDeliveryLegs(legs, view);
  addReturnLeg(legs, view);
  return legs;
}

function returnLegFromView(view: AuditView): AuditLeg | undefined {
  const lastPlace = view.places.at(-1);
  const lastNode = view.delivery.at(-1);
  if (!lastPlace) return undefined;
  if (!lastNode) return undefined;
  if (!view.end) return undefined;
  const fromDeparture = Date.parse(lastNode.schedule.departure_utc);
  const returnArrival = Date.parse(view.end.schedule.arrival_utc ?? '');
  const gapSeconds = (returnArrival - fromDeparture) / 1000;
  const km = haversineKm(lastPlace, NORTH_POLE);
  return { km, kmh: legSpeedKmh(lastPlace, NORTH_POLE, gapSeconds) ?? 0, gapMinutes: gapSeconds / 60, eastward: unwrapEastwardDelta(lastPlace.lng, NORTH_POLE.lng), kind: 'return', fromName: lastNode.location.name, toName: 'END', toNode: view.end };
}

function addReturnLeg(legs: AuditLeg[], view: AuditView): void {
  const leg = returnLegFromView(view);
  if (leg) legs.push(leg);
}

function addTravelTimingCheck(view: AuditView, legs: AuditLeg[], checks: AuditCheck[]): void {
  const failures: string[] = [];
  for (let index = 0; index < view.delivery.length; index++) {
    const previous = index === 0 ? view.start : view.delivery[index - 1];
    const current = view.delivery[index];
    const leg = legs.find((item) => item.toNode === current);
    if (!previous || !current || !leg) continue;
    const arrival = Date.parse(current.schedule.arrival_utc ?? '');
    const departure = Date.parse(previous.schedule.departure_utc);
    const recorded = current.transit_to_here?.duration_seconds ?? 0;
    if (!Number.isFinite(arrival) || !Number.isFinite(departure) || arrival < departure + recorded * 1000) {
      failures.push(`${current.location.name}: arrival precedes prior departure plus ${recorded}s travel`);
    }
  }
  const previous = view.delivery.at(-1);
  const end = view.end;
  if (!previous || !end || !legs.at(-1)) failures.push('missing return leg');
  else {
    const arrival = Date.parse(end.schedule.arrival_utc ?? '');
    const departure = Date.parse(previous.schedule.departure_utc);
    const recorded = end.transit_to_here?.duration_seconds ?? 0;
    if (!Number.isFinite(arrival) || !Number.isFinite(departure) || arrival < departure + recorded * 1000) {
      failures.push(`END arrival precedes prior departure plus ${recorded}s travel`);
    }
  }
  addCheck(checks, 'Travel chronology', failures.length === 0,
    failures.length ? failures.slice(0, 6).join('; ') : 'Each arrival follows the prior departure and recorded travel time.');
}

function addSpeedCheck(legs: AuditLeg[], checks: AuditCheck[]): void {
  const speeds = legs.map((leg) => leg.kmh);
  const p90 = percent(speeds, 0.9);
  const maximum = Math.max(...speeds);
  const pass = p90 <= 20_000 && maximum <= 25_000;
  addCheck(checks, 'Leg speed', pass, `calculated p90 ${human(p90)} km/h (limit 20,000); max ${human(maximum)} km/h (limit 25,000).`);
}

function addEastwardCheck(view: AuditView, legs: AuditLeg[], checks: AuditCheck[]): void {
  const firstOffsetAtOrBelow12 = view.places.findIndex((place) => (place.utcOffsetMinutes ?? Infinity) <= 720);
  const eastward = legs.filter((leg) => leg.eastward > 1 && leg.kind !== 'launch');
  const violations: string[] = [];
  const details = eastward.map((leg) => {
    const reason = leg.toNode?.transit_to_here?.eastward_reason ?? 'none';
    const destinationIndex = leg.toNode ? view.delivery.indexOf(leg.toNode) : -1;
    const originOffset = destinationIndex > 0 ? view.places[destinationIndex - 1]?.utcOffsetMinutes : undefined;
    const destinationOffset = destinationIndex >= 0 ? view.places[destinationIndex]?.utcOffsetMinutes : undefined;
    const beforeSweep = destinationIndex >= 0 && (firstOffsetAtOrBelow12 === -1 || destinationIndex < firstOffsetAtOrBelow12)
      && (destinationOffset ?? -Infinity) > 720;
    const originLongitude = destinationIndex > 0 ? view.delivery[destinationIndex - 1]?.location.lng : undefined;
    const crossesDateLine = originLongitude !== undefined && Math.abs(normalizedLongitude(leg.toNode?.location.lng ?? 0) - normalizedLongitude(originLongitude)) > 180;
    const plausible = reason === 'dateline' ? beforeSweep && crossesDateLine
      : reason === 'return' ? leg.kind === 'return'
        : reason === 'offset-anomaly' ? originOffset !== undefined && destinationOffset !== undefined && destinationOffset > originOffset
          : false;
    if (!plausible) violations.push(`${leg.fromName} -> ${leg.toName}: ${reason} is missing or implausible`);
    return `${leg.fromName} -> ${leg.toName} (${Math.round(leg.eastward)}° east, reason ${reason})`;
  });
  addCheck(checks, 'Eastward legs', violations.length === 0,
    `${eastward.length ? details.join('; ') : 'no legs move east by more than 1°'}${violations.length ? `. Failures: ${violations.join('; ')}` : ''}.`);
}

function detourFindings(view: AuditView): { fail: string[]; warnings: string[] } {
  const fail: string[] = [];
  const warnings: string[] = [];
  const countryCounts = new Map<string, number>();
  for (const place of view.places) countryCounts.set(place.country, (countryCounts.get(place.country) ?? 0) + 1);
  for (let index = 1; index < view.places.length - 1; index++) {
    const previous = view.places[index - 1]; const current = view.places[index]; const next = view.places[index + 1];
    if (!previous || !current || !next) continue;
    const via = haversineKm(previous, current) + haversineKm(current, next);
    const direct = haversineKm(previous, next);
    if (via > 0 && via > direct * 2.5) {
      const finding = `${current.name}: ${human(via)} km via vs ${human(direct)} km direct (${(via / direct).toFixed(2)}x)`;
      if ((countryCounts.get(current.country) ?? 0) === 1) warnings.push(`${finding}; only stop for ${current.country}`);
      else fail.push(finding);
    }
  }
  return { fail, warnings };
}

function addDetourCheck(view: AuditView, checks: AuditCheck[]): void {
  const findings = detourFindings(view);
  addCheck(checks, 'Detours', findings.fail.length === 0,
    `${findings.fail.length ? `FAIL ${findings.fail.join('; ')}` : 'no uncovered-country detours'}${findings.warnings.length ? `; WARNING ${findings.warnings.join('; ')}` : ''}.`);
}

function addDistanceReport(legs: AuditLeg[], reports: { name: string; detail: string }[]): void {
  const pathKm = legs.reduce((sum, leg) => sum + leg.km, 0);
  reports.push({ name: 'Path length', detail: `${human(pathKm)} km including launch and return.` });
}

function addCoverageReports(view: AuditView, context: RouteAuditContext, legs: AuditLeg[], reports: { name: string; detail: string }[]): void {
  const countries = [...new Set(view.delivery.map((node) => node.location.country_code).filter((code): code is string => !!code))].sort();
  const continents: Record<string, number> = {};
  for (const place of view.places) {
    const continent = classifyRegion(place).continent;
    continents[continent] = (continents[continent] ?? 0) + 1;
  }
  reports.push({ name: 'Coverage', detail: `${view.delivery.length} stops; ${countries.length} countries/territories (${countries.join(', ')}); per-continent ${Object.entries(continents).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `${name} ${count}`).join(', ')}.` });
  const worldPlaces = context.worldPlaces ?? context.pool;
  const populationTotal = worldPlaces.reduce((sum, place) => sum + Math.max(0, place.population ?? 0), 0);
  const coveredPopulation = worldPlaces.reduce((sum, place) => sum + (view.places.some((stop) => haversineKm(stop, place) <= 500) ? Math.max(0, place.population ?? 0) : 0), 0);
  const share = populationTotal ? coveredPopulation / populationTotal * 100 : 0;
  reports.push({ name: 'Population proxy', detail: `${share.toFixed(1)}% of listed places.json population within 500 km of a stop (${human(coveredPopulation)} of ${human(populationTotal)}).` });
  const longest = [...legs].sort((a, b) => b.km - a.km).slice(0, 20)
    .map((leg) => `${leg.fromName} -> ${leg.toName} ${human(leg.km)} km`).join('; ');
  reports.push({ name: 'Longest 20 legs', detail: longest || 'No leg data.' });
  const histogram: Record<string, number> = {};
  for (const node of view.delivery) {
    const arrival = Date.parse(node.schedule.arrival_utc ?? '');
    const place = view.places.find((candidate) => candidate.id === node.candidate_id);
    const date = new Date(arrival + (place?.utcOffsetMinutes ?? 0) * 60_000);
    const hour = date.getUTCHours();
    const key = `${hour.toString().padStart(2, '0')}:00`;
    histogram[key] = (histogram[key] ?? 0) + 1;
  }
  reports.push({ name: 'Local-arrival histogram', detail: Object.entries(histogram).sort(([a], [b]) => a.localeCompare(b)).map(([hour, count]) => `${hour} ${count}`).join(', ') || 'No arrival data.' });
}

function addPacingChecks(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const usable = view.matched && !!view.start && !!view.end && view.delivery.length === view.places.length && view.places.length > 0;
  if (!usable) {
    addCheck(checks, 'Travel chronology', false, 'Cannot calculate paced legs.');
    addCheck(checks, 'Leg speed', false, 'Cannot calculate leg speeds.');
    addCheck(checks, 'Eastward legs', false, 'Cannot calculate route direction.');
    addCheck(checks, 'Detours', false, 'Cannot calculate route detours.');
    return;
  }
  const takeoff = Date.parse(TAKEOFF_UTC);
  const legs = buildAuditLegs(view, takeoff);
  addTravelTimingCheck(view, legs, checks);
  addSpeedCheck(legs, checks);
  addEastwardCheck(view, legs, checks);
  addDetourCheck(view, checks);
}

export function auditRouteDocument(document: unknown, context: RouteAuditContext): AuditResult {
  const checks: AuditCheck[] = [];
  const view = createAuditView(document, context);
  addHeaderChecks(document, context, view, checks);
  addNameAndRegionCheck(view, checks);
  addSelectionChecks(context, view, checks);
  addFlightWindowCheck(context, view, checks);
  addPacingChecks(context, view, checks);
  const reports: { name: string; detail: string }[] = [];
  const reportLegs = view.matched ? buildAuditLegs(view, Date.parse(TAKEOFF_UTC)) : [];
  addDistanceReport(reportLegs, reports);
  if (view.matched) addCoverageReports(view, context, reportLegs, reports);
  return { checks, reports, pass: checks.every((check) => check.pass) };
}
