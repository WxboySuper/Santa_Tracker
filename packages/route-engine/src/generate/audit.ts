import { LegacyRouteFixtureSchema } from '@santa-tracker/contracts';
import { haversineKm, legSpeedKmh } from '../geo';
import { classifyRegion } from './regions';
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
  report: Pick<RouteReport, 'continentBalance' | 'subregionBalance'>;
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
  stop_experience?: { presents?: number | null; presents_delivered_at_stop?: number | null; camera_zoom?: number | null; weather_condition?: string | null; stop_tier?: string | null; duration_seconds?: number | null };
  transit_to_here?: { duration_seconds?: number | null; distance_km?: number | null; speed_kmh?: number | null; eastward_reason?: 'dateline' | 'offset-anomaly' | 'return' | 'soft-orienteering' | null; route_reason?: string | null } | null;
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

function usesOrienteering(context: RouteAuditContext): boolean {
  return Boolean((context.config as typeof context.config & { useOrienteering?: boolean }).useOrienteering);
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

function isLocalChristmasDate(local: Date): boolean {
  return local.getUTCFullYear() === 2026 && local.getUTCMonth() === 11;
}

function isInPreferredLocalWindow(local: Date): boolean {
  const day = local.getUTCDate();
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  return (day === 24 && minute >= 23 * 60) || (day === 25 && minute <= 5 * 60);
}

function localArrivalFailures(node: RouteNode, place: Candidate): string[] {
  const arrival = node.schedule.arrival_utc;
  if (!arrival) return [`${node.location.name}: missing arrival time`];
  const offset = place.utcOffsetMinutes;
  if (offset === undefined) return [`${node.location.name}: missing snapshot UTC offset`];
  const local = new Date(Date.parse(arrival) + offset * 60_000);
  return isLocalChristmasDate(local) && isInPreferredLocalWindow(local)
    ? [] : [`${node.location.name}: local arrival is outside Dec 24 23:00–Dec 25 05:00`];
}

function displayOffsetFailures(node: RouteNode, place: Candidate): string[] {
  const displayOffset = node.location.timezone_offset;
  if (place.utcOffsetMinutes === undefined) return [];
  if (displayOffset === undefined) return [];
  if (displayOffset === place.utcOffsetMinutes / 60) return [];
  return [`${node.location.name}: display offset differs from the snapshot`];
}

function timezoneFailuresForNode(node: RouteNode, place: Candidate | undefined, context: RouteAuditContext, checkWindow: boolean): string[] {
  if (!timezoneNodeIsComplete(node, place)) return [`${node.location.name}: missing candidate, time, country, or timezone`];
  const failures = [
    ...timezoneCountryFailures(node, place, context),
    ...timezoneOffsetFailures(node, place, context),
    ...displayOffsetFailures(node, place),
  ];
  if (checkWindow && place) failures.push(...localArrivalFailures(node, place));
  return failures;
}

function addTimezoneChecks(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const failures: string[] = [];
  let outsideWindow = 0;
  view.delivery.forEach((node, index) => {
    const place = view.places[index];
    failures.push(...timezoneFailuresForNode(node, place, context, !usesOrienteering(context)));
    if (place && localArrivalFailures(node, place).length > 0) outsideWindow++;
  });
  addCheck(checks, 'Timezone and local arrival window', failures.length === 0,
    failures.length ? failures.slice(0, 6).join('; ')
      : usesOrienteering(context)
        ? `${view.delivery.length} stops match country zones; ${outsideWindow} arrivals fall outside the preferred local window (soft penalty).`
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

function hasMandatoryCoverageSpacingException(node: RouteNode | undefined): boolean {
  const reason = node?.transit_to_here?.route_reason;
  return reason?.includes('mandatory-country-coverage-spacing-exception') ?? false;
}

function unrecordedSpacingFailures(view: AuditView, minimumDistance: number): string[] {
  const failures: string[] = [];
  for (let left = 0; left < view.places.length; left++) {
    for (let right = left + 1; right < view.places.length; right++) {
      const first = view.places[left];
      const second = view.places[right];
      if (!first || !second) continue;
      const distance = haversineKm(first, second);
      if (distance >= minimumDistance) continue;
      if (hasMandatoryCoverageSpacingException(view.delivery[left])) continue;
      if (hasMandatoryCoverageSpacingException(view.delivery[right])) continue;
      failures.push(`${first.name} and ${second.name} are ${human(distance)} km apart without a mandatory coverage exception`);
    }
  }
  return failures;
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
  spacingFailures: string[];
};

function coordinateRulesPass({ vetoed, vetoNameStops, coordinateProblems, duplicateCount, spacingFailures }: CoordinateAuditSummary): boolean {
  if (vetoed.length > 0) return false;
  if (vetoNameStops.length > 0) return false;
  if (coordinateProblems.length > 0) return false;
  if (duplicateCount > 0) return false;
  return spacingFailures.length === 0;
}

function separationDetail(minSeparation: number, spacingFailures: string[], view: AuditView, minimumDistance: number): string {
  if (spacingFailures.length > 0) return spacingFailures.slice(0, 4).join('; ');
  const base = `country bounds and cross-source name coordinates pass; no duplicates; nearest pair ${human(minSeparation)} km apart`;
  if (view.delivery.some(hasMandatoryCoverageSpacingException)) return `${base} under a recorded mandatory country-coverage exception; all other pairs meet ${minimumDistance} km`;
  return `${base} (minimum ${minimumDistance} km apart)`;
}

function addCoordinateChecks(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const coordinateProblems = coordinateAuditFailures(view.places, context.pool, context.countryBoundsByCode);
  const vetoed = vetoedRouteStops(view, context).map((node) => node.location.name);
  const duplicateCount = duplicateStopCount(view.delivery);
  const minSeparation = minimumSeparationKm(view.places);
  const spacingFailures = unrecordedSpacingFailures(view, 20);
  const vetoNames = ['Dzhankoy', 'Kursk', 'Zelenodolsk', 'Bikini Atoll', 'Point Barrow'];
  const vetoNameStops = view.delivery.filter((node) => vetoNames.includes(node.location.name));
  const minimumDistance = 20;
  const pass = coordinateRulesPass({ vetoed, vetoNameStops, coordinateProblems, duplicateCount, spacingFailures });
  const detail = vetoed.length || vetoNameStops.length ? `Vetoed stop: ${[...vetoNames, ...vetoed].join(', ')}.`
    : coordinateProblems.length ? coordinateProblems.slice(0, 4).join('; ')
      : `${separationDetail(minSeparation, spacingFailures, view, minimumDistance)}.`;
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

function isCapitalCandidate(place: Candidate): boolean {
  return place.category === 'capital' || ('isNationalCapital' in place && place.isNationalCapital === true)
    || ('isCapital' in place && place.isCapital === true) || ('capital' in place && place.capital === true);
}

function isCuratedCandidate(place: Candidate): boolean {
  return ['cultural', 'nature', 'special'].includes(place.category);
}

function isHeadlineCandidate(place: Candidate): boolean {
  return place.category === 'special' || ('headlineLandmark' in place && place.headlineLandmark === true);
}

function hasKnownPopulation(place: Candidate): place is Candidate & { population: number } {
  return place.population !== undefined;
}

function isCityCandidate(place: Candidate, population: number): boolean {
  return population >= 100_000 || isCapitalCandidate(place) || isCuratedCandidate(place);
}

function tierWithoutPopulation(place: Candidate): string {
  if (isHeadlineCandidate(place)) return 'major';
  if (isCuratedCandidate(place) || isCapitalCandidate(place)) return 'city';
  return 'hop';
}

function majorTierAtPopulation(place: Candidate, population: number): boolean {
  return isHeadlineCandidate(place) || population >= 1_000_000
    || (isCapitalCandidate(place) && population >= 250_000);
}

function expectedTier(place: Candidate): string {
  if (!hasKnownPopulation(place)) return tierWithoutPopulation(place);
  const population = place.population;
  if (majorTierAtPopulation(place, population)) return 'major';
  if (isCityCandidate(place, population)) return 'city';
  if (population >= 5_000) return 'town';
  return 'hop';
}

function tierDurationMatches(tier: string, duration: number | undefined): boolean {
  const expectedSeconds = STOP_TIER_SECONDS[tier];
  if (expectedSeconds === undefined) return false;
  return duration === expectedSeconds;
}

function matchesExpectedTier(tier: string, place: Candidate | undefined): boolean {
  if (!place) return true;
  return tier === expectedTier(place);
}

function hasValidStopTier(tier: string, duration: number | undefined, place: Candidate | undefined): boolean {
  if (!tierDurationMatches(tier, duration)) return false;
  return matchesExpectedTier(tier, place);
}

function tierFailure(node: RouteNode, place: Candidate | undefined): string | undefined {
  const tier = node.stop_experience?.stop_tier ?? '';
  const duration = node.stop_experience?.duration_seconds ?? undefined;
  const expected = place ? expectedTier(place) : undefined;
  if (hasValidStopTier(tier, duration, place)) return undefined;
  return `${node.location.name}: tier ${tier || 'missing'}, duration ${duration ?? 'missing'}s${expected ? `, expected ${expected}` : ''}`;
}

function addStopTierCheck(view: AuditView, checks: AuditCheck[]): void {
  const counts: Record<string, number> = {};
  const failures: string[] = [];
  for (const [index, node] of view.delivery.entries()) {
    const tier = node.stop_experience?.stop_tier ?? '';
    counts[tier || 'missing'] = (counts[tier || 'missing'] ?? 0) + 1;
    const failure = tierFailure(node, view.places[index]);
    if (failure) failures.push(failure);
  }
  addCheck(checks, 'Stop tiers and duration', failures.length === 0,
    `${failures.length ? failures.slice(0, 6).join('; ') : 'all DELIVERY stops have a valid tier and matching duration'}; counts ${Object.entries(counts).map(([tier, count]) => `${tier} ${count}`).join(', ')}.`);
}

function hasMissingSource(node: RouteNode): boolean {
  return !isTrustedSource(node.notes);
}

function hasIncompleteExperience(node: RouteNode): boolean {
  const experience = node.stop_experience;
  if (!experience) return true;
  const presents = experience.presents;
  if (typeof presents !== 'number') return true;
  if (!Number.isSafeInteger(presents)) return true;
  if (presents < 0) return true;
  if (experience.presents_delivered_at_stop !== presents) return true;
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

function arrivalFollowsRecordedTravel(arrival: number, departure: number, recordedSeconds: number): boolean {
  if (!Number.isFinite(arrival)) return false;
  if (!Number.isFinite(departure)) return false;
  return arrival >= departure + recordedSeconds * 1000;
}

function chronologyFailure(previous: RouteNode, current: RouteNode): string | undefined {
  const arrival = Date.parse(current.schedule.arrival_utc ?? '');
  const departure = Date.parse(previous.schedule.departure_utc);
  const recorded = current.transit_to_here?.duration_seconds ?? 0;
  if (arrivalFollowsRecordedTravel(arrival, departure, recorded)) return undefined;
  return `${current.location.name}: arrival precedes prior departure plus ${recorded}s travel`;
}

function deliveryChronologyFailures(view: AuditView, legs: AuditLeg[]): string[] {
  const failures: string[] = [];
  for (const [index, current] of view.delivery.entries()) {
    if (!legs.some((leg) => leg.toNode === current)) continue;
    const previous = index === 0 ? view.start : view.delivery[index - 1];
    const failure = previous ? chronologyFailure(previous, current) : undefined;
    if (failure) failures.push(failure);
  }
  return failures;
}

function returnChronologyFailure(view: AuditView, legs: AuditLeg[]): string | undefined {
  const previous = view.delivery.at(-1);
  const end = view.end;
  if (!previous) return 'missing return leg';
  if (!end) return 'missing return leg';
  if (!legs.at(-1)) return 'missing return leg';
  const failure = chronologyFailure(previous, end);
  return failure ? failure.replace(end.location.name, 'END') : undefined;
}

function addTravelTimingCheck(view: AuditView, legs: AuditLeg[], checks: AuditCheck[]): void {
  const failures = [...deliveryChronologyFailures(view, legs)];
  const returnFailure = returnChronologyFailure(view, legs);
  if (returnFailure) failures.push(returnFailure);
  addCheck(checks, 'Travel chronology', failures.length === 0,
    failures.length ? failures.slice(0, 6).join('; ') : 'Each arrival follows the prior departure and recorded travel time.');
}

function addSpeedCheck(legs: AuditLeg[], checks: AuditCheck[]): void {
  const speeds = legs.map((leg) => leg.kmh);
  const median = percent(speeds, 0.5);
  const p90 = percent(speeds, 0.9);
  const maximum = Math.max(...speeds);
  const pass = maximum <= 25_000;
  addCheck(checks, 'Leg speed', pass, `median ${human(median)} km/h; p90 ${human(p90)} km/h; max ${human(maximum)} km/h (hard limit 25,000).`);
}

function longMeridionalDirection(from: Candidate | undefined, to: Candidate | undefined): number | undefined {
  if (!from) return undefined;
  if (!to) return undefined;
  if (haversineKm(from, to) < 1_500) return undefined;
  const latitudeChange = to.lat - from.lat;
  if (Math.abs(latitudeChange) < 20) return undefined;
  return Math.sign(latitudeChange);
}

function meridionalDirections(places: Candidate[]): number[] {
  const directions: number[] = [];
  for (let index = 1; index < places.length; index++) {
    const direction = longMeridionalDirection(places[index - 1], places[index]);
    if (direction !== undefined) directions.push(direction);
  }
  return directions;
}

function northSouthReversals(directions: number[]): number {
  let reversals = 0;
  let previous = directions[0];
  for (const direction of directions.slice(1)) {
    if (previous !== undefined && direction !== previous) reversals++;
    previous = direction;
  }
  return reversals;
}

function addCombCheck(view: AuditView, checks: AuditCheck[]): void {
  const reversals = northSouthReversals(meridionalDirections(view.places));
  addCheck(checks, 'Repeated north-south reversals', reversals < 3,
    `${reversals} reversals across legs longer than 1,500 km and 20 degrees latitude; three or more indicates a comb route.`);
}

function addLongLegReasonCheck(legs: AuditLeg[], checks: AuditCheck[]): void {
  const long = legs.filter((leg) => leg.km > 4_000);
  const missing = long.filter((leg) => !leg.toNode?.transit_to_here?.route_reason);
  const details = long.map((leg) => `${leg.fromName} -> ${leg.toName} ${human(leg.km)} km (${leg.toNode?.transit_to_here?.route_reason ?? 'no reason'})`);
  addCheck(checks, 'Reasons for legs over 4,000 km', missing.length === 0,
    long.length ? details.join('; ') : 'No legs exceed 4,000 km.');
}

function deliveryIndex(view: AuditView, leg: AuditLeg): number {
  if (!leg.toNode) return -1;
  return view.delivery.indexOf(leg.toNode);
}

function plausibleOffsetAnomaly(view: AuditView, leg: AuditLeg): boolean {
  const index = deliveryIndex(view, leg);
  if (index <= 0) return false;
  const origin = view.places[index - 1]?.utcOffsetMinutes;
  const destination = view.places[index]?.utcOffsetMinutes;
  if (origin === undefined) return false;
  if (destination === undefined) return false;
  return destination > origin;
}

function destinationIsBeforeSweep(view: AuditView, index: number): boolean {
  if (index < 0) return false;
  const firstIndex = view.places.findIndex((place) => (place.utcOffsetMinutes ?? Infinity) <= 720);
  if (firstIndex !== -1 && index >= firstIndex) return false;
  return (view.places[index]?.utcOffsetMinutes ?? -Infinity) > 720;
}

function destinationCrossesDateLine(view: AuditView, leg: AuditLeg, index: number): boolean {
  if (index <= 0) return false;
  const originLongitude = view.delivery[index - 1]?.location.lng;
  if (originLongitude === undefined) return false;
  const destinationLongitude = leg.toNode?.location.lng ?? 0;
  return Math.abs(normalizedLongitude(destinationLongitude) - normalizedLongitude(originLongitude)) > 180;
}

function plausibleDateline(view: AuditView, leg: AuditLeg): boolean {
  const index = deliveryIndex(view, leg);
  return destinationIsBeforeSweep(view, index) && destinationCrossesDateLine(view, leg, index);
}

function plausibleEastwardReason(view: AuditView, leg: AuditLeg, context: RouteAuditContext): boolean {
  if (leg.km <= 1_500) return true;
  const reason = leg.toNode?.transit_to_here?.eastward_reason;
  if (reason === 'soft-orienteering') return usesOrienteering(context);
  if (reason === 'return') return leg.kind === 'return';
  if (reason === 'offset-anomaly') return plausibleOffsetAnomaly(view, leg);
  if (reason === 'dateline') return plausibleDateline(view, leg);
  return false;
}

function addEastwardCheck(context: RouteAuditContext, view: AuditView, legs: AuditLeg[], checks: AuditCheck[]): void {
  const eastward = legs.filter((leg) => leg.eastward > 1 && leg.kind !== 'launch');
  const failures = eastward.filter((leg) => !plausibleEastwardReason(view, leg, context))
    .map((leg) => `${leg.fromName} -> ${leg.toName}: missing or implausible reason over ${human(leg.km)} km`);
  const details = eastward.map((leg) => `${leg.fromName} -> ${leg.toName} (${Math.round(leg.eastward)}° east, ${human(leg.km)} km, reason ${leg.toNode?.transit_to_here?.eastward_reason ?? 'none'})`);
  addCheck(checks, 'Eastward legs', failures.length === 0,
    `${eastward.length ? details.join('; ') : 'no eastward legs'}${failures.length ? `. Failures: ${failures.join('; ')}` : ''}.`);
}

function countryCountsFor(places: Candidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const place of places) counts.set(place.country, (counts.get(place.country) ?? 0) + 1);
  return counts;
}

function detourAt(places: Candidate[], index: number): { name: string; country: string; via: number; direct: number } | undefined {
  const previous = places[index - 1];
  const current = places[index];
  const next = places[index + 1];
  if (!previous) return undefined;
  if (!current) return undefined;
  if (!next) return undefined;
  const via = haversineKm(previous, current) + haversineKm(current, next);
  const direct = haversineKm(previous, next);
  if (direct <= 0) return undefined;
  if (via <= direct * 2.5) return undefined;
  return { name: current.name, country: current.country, via, direct };
}

function detourFindings(view: AuditView): { fail: string[]; warnings: string[] } {
  const fail: string[] = [];
  const warnings: string[] = [];
  const countryCounts = countryCountsFor(view.places);
  for (let index = 1; index < view.places.length - 1; index++) {
    const detour = detourAt(view.places, index);
    if (!detour) continue;
    const finding = `${detour.name}: ${human(detour.via)} km via vs ${human(detour.direct)} km direct (${(detour.via / detour.direct).toFixed(2)}x)`;
    if ((countryCounts.get(detour.country) ?? 0) === 1) warnings.push(`${finding}; only stop for ${detour.country}`);
    else fail.push(finding);
  }
  return { fail, warnings };
}

function addDetourCheck(context: RouteAuditContext, view: AuditView, checks: AuditCheck[]): void {
  const findings = detourFindings(view);
  const pass = usesOrienteering(context) || findings.fail.length === 0;
  addCheck(checks, 'Detours', pass,
    `${findings.fail.length ? `${usesOrienteering(context) ? 'SOFT' : 'FAIL'} ${findings.fail.join('; ')}` : 'no repeated-country detours'}${findings.warnings.length ? `; WARNING ${findings.warnings.join('; ')}` : ''}.`);
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
    .map((leg) => `${leg.fromName} -> ${leg.toName} ${human(leg.km)} km, ${human(leg.kmh)} km/h, reason ${leg.toNode?.transit_to_here?.route_reason ?? 'none'}`).join('; ');
  reports.push({ name: 'Longest 20 legs', detail: longest || 'No leg data.' });
  const speeds = legs.map((leg) => leg.kmh);
  reports.push({ name: 'Leg speed percentiles', detail: `median ${human(percent(speeds, 0.5))} km/h; p90 ${human(percent(speeds, 0.9))} km/h; maximum ${human(Math.max(...speeds))} km/h.` });
  const longReasons = legs.filter((leg) => leg.km > 4_000)
    .map((leg) => `${leg.fromName} -> ${leg.toName} ${human(leg.km)} km (${leg.toNode?.transit_to_here?.route_reason ?? 'no reason'})`);
  reports.push({ name: 'Legs over 4,000 km', detail: longReasons.join('; ') || 'None.' });
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
    addCheck(checks, 'Repeated north-south reversals', false, 'Cannot calculate route direction.');
    addCheck(checks, 'Reasons for legs over 4,000 km', false, 'Cannot calculate leg reasons.');
    addCheck(checks, 'Detours', false, 'Cannot calculate route detours.');
    return;
  }
  const takeoff = Date.parse(TAKEOFF_UTC);
  const legs = buildAuditLegs(view, takeoff);
  addTravelTimingCheck(view, legs, checks);
  addSpeedCheck(legs, checks);
  addEastwardCheck(context, view, legs, checks);
  addCombCheck(view, checks);
  addLongLegReasonCheck(legs, checks);
  addDetourCheck(context, view, checks);
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
