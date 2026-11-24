import { LegacyRouteFixtureSchema } from '@santa-tracker/contracts';
import { haversineKm, legSpeedKmh } from '../geo';
import { allocateQuotas } from './selection';
import { classifyRegion, formatUtcOffset } from './regions';
import { localMinute } from './timezone';
import { NORTH_POLE, TAKEOFF_UTC, type Candidate, type GeneratorConfig } from './types';

export type AuditCheck = { name: string; pass: boolean; detail: string };
export type AuditResult = { checks: AuditCheck[]; pass: boolean };

export type RouteAuditContext = {
  config: GeneratorConfig;
  pool: Candidate[];
  selected: Candidate[];
  zonesByCountry: Record<string, string[]>;
  utcOffsetsByTimezone: Record<string, number>;
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

function canBeSelected(place: Candidate, config: GeneratorConfig, veto: Set<string>): boolean {
  if (veto.has(place.id) || config.uninhabitedIslandIds.includes(place.id) || place.utcOffsetMinutes === undefined) return false;
  if (['cultural', 'nature', 'special'].includes(place.category)) return true;
  return place.worldCity === true || (place.population ?? 0) >= config.hubPopulationMinimum || config.underservedCountries.includes(place.country);
}

export function auditRouteDocument(document: unknown, context: RouteAuditContext): AuditResult {
  const checks: AuditCheck[] = [];
  const add = (name: string, pass: boolean, detail: string): void => { checks.push({ name, pass, detail }); };
  const nodes = routeNodes(document);
  const delivery = nodes.filter((node) => node.type === 'DELIVERY');
  const start = nodes.find((node) => node.type === 'START');
  const end = nodes.find((node) => node.type === 'END');
  const byId = new Map(context.selected.map((place) => [place.id, place]));
  const candidates = delivery.map((node) => node.candidate_id ? byId.get(node.candidate_id) : undefined);
  const matched = candidates.every((place) => place !== undefined) && candidates.length === delivery.length;
  const places = candidates.filter((place): place is Candidate => place !== undefined);
  const meta = isRecord(document) && isRecord(document.meta) ? document.meta : {};
  const validFixture = LegacyRouteFixtureSchema.safeParse(document).success;

  add('Legacy route schema', validFixture, validFixture ? 'Legacy route fixture parses.' : 'Legacy route fixture does not parse.');
  add('North Pole start and end', !!start && !!end && nodes[0] === start && nodes.at(-1) === end
    && start.location.lat === NORTH_POLE.lat && Math.abs(start.location.lng) === 180
    && end.location.lat === NORTH_POLE.lat && Math.abs(end.location.lng) === 180,
  start && end ? `${nodes.length} nodes begin at START and end at END.` : 'START or END node is missing.');
  add('Candidate identity', matched && new Set(delivery.map((node) => node.candidate_id)).size === delivery.length,
    `${places.length}/${delivery.length} delivery nodes map to unique snapshot candidates.`);
  const routeCandidateIds = new Set(delivery.map((node) => node.candidate_id).filter((id): id is string => typeof id === 'string'));
  const missingRequiredStops = context.config.requiredStopIds.filter((id) => !routeCandidateIds.has(id));
  const deliveryCountries = new Set(delivery.map((node) => node.location.country_code).filter((code): code is string => typeof code === 'string'));
  const missingRequiredCountries = context.config.requiredCountries.filter((code) => !deliveryCountries.has(code));
  add('Required iconic and regional stops', missingRequiredStops.length === 0 && missingRequiredCountries.length === 0,
    missingRequiredStops.length || missingRequiredCountries.length
      ? `Missing stop ids ${missingRequiredStops.join(', ') || 'none'}; missing countries ${missingRequiredCountries.join(', ') || 'none'}.`
      : `${context.config.requiredStopIds.length} required iconic stops and countries ${context.config.requiredCountries.join(', ')} are present.`);
  const routeVersion = typeof meta.route_version === 'string' ? meta.route_version : 'missing';
  const generatedAt = typeof meta.generated_at === 'string' ? meta.generated_at : 'missing';
  add('Committed version and timestamp', routeVersion === '2026-draft-1' && generatedAt === context.config.generatedAt && Date.parse(generatedAt) <= Date.now(),
    `version ${routeVersion}; generated_at ${generatedAt}.`);

  if (matched) {
    const categoryCounts = delivery.reduce<Record<string, number>>((counts, node) => {
      const category = node.comment ?? 'missing';
      counts[category] = (counts[category] ?? 0) + 1;
      return counts;
    }, {});
    const expectedCategories = allocateQuotas(context.config.total, context.config.weights);
    const categoryMatch = Object.entries(expectedCategories).every(([category, expected]) => categoryCounts[category] === expected);
    const coreHubs = delivery.filter((node, index) => {
      const place = places[index];
      return node.comment === 'hub' && place && (place.worldCity === true || (place.population ?? 0) >= context.config.hubPopulationCore);
    }).length;
    const hubsQualified = delivery.every((node, index) => node.comment !== 'hub' || ((places[index]?.worldCity === true)
      || (places[index]?.population ?? 0) >= context.config.hubPopulationMinimum));
    add('Stop count and category mix', delivery.length === context.config.total && categoryMatch,
      `${delivery.length} stops; ${Object.entries(categoryCounts).map(([name, count]) => `${name} ${count}`).join(', ')}.`);
    add('Hub definition', hubsQualified && coreHubs >= context.config.hubCoreMinimum,
      `${coreHubs} of ${categoryCounts.hub ?? 0} hubs meet world-city or ${context.config.hubPopulationCore.toLocaleString()}+ population; all hubs meet ${context.config.hubPopulationMinimum.toLocaleString()}+ population or world-city status.`);

    const timezoneFailures: string[] = [];
    const timezoneCounts = new Map<number, number>();
    delivery.forEach((node, index) => {
      const place = places[index];
      const arrival = node.schedule.arrival_utc;
      if (!place || !arrival || !node.location.timezone || !node.location.country_code) {
        timezoneFailures.push(`${node.location.name}: missing candidate, time, country, or timezone`);
        return;
      }
      const allowed = context.zonesByCountry[node.location.country_code] ?? [];
      if (node.location.country_code !== place.country || node.location.timezone !== place.timezone || !allowed.includes(node.location.timezone)) {
        timezoneFailures.push(`${node.location.name}: ${node.location.timezone} is not an allowed ${node.location.country_code} timezone`);
      }
      const snapshotZoneOffset = context.utcOffsetsByTimezone[node.location.timezone];
      if (snapshotZoneOffset === undefined || snapshotZoneOffset !== place.utcOffsetMinutes) {
        timezoneFailures.push(`${node.location.name}: snapshot offset ${place.utcOffsetMinutes} differs from ${node.location.timezone} offset ${snapshotZoneOffset ?? 'missing'}`);
      }
      const localMinuteOfDay = localMinute(arrival, place.utcOffsetMinutes ?? Number.NaN);
      if (localMinuteOfDay < 0) timezoneFailures.push(`${node.location.name}: snapshot local arrival is not December 25`);
      if (localMinuteOfDay < context.config.arrivalStartMinute || localMinuteOfDay > context.config.arrivalEndMinute) timezoneFailures.push(`${node.location.name}: outside the local arrival window`);
      if (place.utcOffsetMinutes !== undefined && node.location.timezone_offset !== undefined && node.location.timezone_offset !== place.utcOffsetMinutes / 60) timezoneFailures.push(`${node.location.name}: display offset differs from the snapshot`);
      if (place.utcOffsetMinutes !== undefined) timezoneCounts.set(place.utcOffsetMinutes, (timezoneCounts.get(place.utcOffsetMinutes) ?? 0) + 1);
    });
    add('Timezone and local Christmas arrivals', timezoneFailures.length === 0,
      timezoneFailures.length ? timezoneFailures.slice(0, 6).join('; ') : `${delivery.length} stops match country zones, real IANA offsets, Dec 25, and 00:20–03:00 local.`);

    const eligibleOffsets = new Set(context.pool.filter((place) => canBeSelected(place, context.config, new Set(context.vetoIds))).map((place) => place.utcOffsetMinutes).filter((value): value is number => value !== undefined));
    const missingOffsets = [...eligibleOffsets].filter((value) => (timezoneCounts.get(value) ?? 0) < 1).sort((a, b) => a - b);
    add('UTC offset coverage', missingOffsets.length === 0,
      missingOffsets.length ? `Missing ${missingOffsets.map(formatUtcOffset).join(', ')}.` : `${eligibleOffsets.size} populated offsets represented; ${[...timezoneCounts].sort(([a], [b]) => a - b).map(([offset, count]) => `${formatUtcOffset(offset)} ${count}`).join(', ')}.`);

    const regions = places.map(classifyRegion);
    const countRegion = (predicate: (region: (typeof regions)[number]) => boolean): number => regions.filter(predicate).length;
    const regionalFailures: string[] = [];
    const regionTests: [string, number, number][] = [
      ['Western and Northern Europe', countRegion((region) => region.westernNorthernEurope), context.config.regionalMinimums.westernNorthernEurope],
      ['Australia and New Zealand', countRegion((region) => region.australiaNewZealand), context.config.regionalMinimums.australiaNewZealand],
      ['Pacific islands', countRegion((region) => region.pacificIsland), context.config.regionalMinimums.pacificIslands],
      ['Africa', countRegion((region) => region.africa), context.config.regionalMinimums.africa],
      ['Middle East', countRegion((region) => region.middleEast), context.config.regionalMinimums.middleEast],
      ['Greenland or Arctic Canada', countRegion((region) => region.arctic), context.config.regionalMinimums.arctic],
    ];
    for (const [name, count, minimum] of regionTests) if (count < minimum) regionalFailures.push(`${name} ${count}/${minimum}`);
    const americas = countRegion((region) => region.americas);
    const southAmerica = countRegion((region) => region.southAmerica);
    const bolivia = places.filter((place) => place.country === 'BO').length;
    if (americas > Math.floor(context.config.total * context.config.maxAmericasPercent / 100)) regionalFailures.push(`Americas ${americas}/${Math.floor(context.config.total * context.config.maxAmericasPercent / 100)}`);
    if (southAmerica > context.config.maxSouthAmericaStops) regionalFailures.push(`South America ${southAmerica}/${context.config.maxSouthAmericaStops}`);
    const boliviaCap = context.config.countryCaps.BO ?? 4;
    if (bolivia > boliviaCap) regionalFailures.push(`Bolivia ${bolivia}/${boliviaCap}`);
    add('Regional quotas and Americas caps', regionalFailures.length === 0,
      regionalFailures.length ? regionalFailures.join('; ') : `${regionTests.map(([name, count]) => `${name} ${count}`).join(', ')}; Americas ${americas}/${context.config.total} (${(americas / context.config.total * 100).toFixed(1)}%), South America ${southAmerica}, Bolivia ${bolivia}.`);

    const countryCounts = new Map<string, number>();
    for (const place of places) countryCounts.set(place.country, (countryCounts.get(place.country) ?? 0) + 1);
    let maxRun = 0;
    let run = 0;
    let previousCountry: string | undefined;
    places.forEach((place) => {
      run = place.country === previousCountry ? run + 1 : 1;
      maxRun = Math.max(maxRun, run);
      previousCountry = place.country;
    });
    const countryFailures = [...countryCounts].filter(([country, count]) => count > (context.config.countryCaps[country] ?? context.config.maxStopsPerCountry));
    add('Country totals and consecutive runs', countryFailures.length === 0 && maxRun <= context.config.maxCountryRun,
      `maximum country total ${Math.max(...countryCounts.values())}; longest run ${maxRun}; limits ${context.config.maxStopsPerCountry} and ${context.config.maxCountryRun}.`);

    const vetoed = delivery.filter((node) => node.candidate_id && context.vetoIds.includes(node.candidate_id)).map((node) => node.location.name);
    const names = new Set(delivery.map((node) => `${node.location.name.trim().toLocaleLowerCase('en')}:${node.location.country_code}`));
    const coords = new Set(delivery.map((node) => `${node.location.lat.toFixed(5)},${node.location.lng.toFixed(5)}`));
    const duplicates = delivery.length - names.size + delivery.length - coords.size;
    const minSeparation = places.length > 1 ? Math.min(...places.flatMap((place, index) => places.slice(index + 1).map((other) => haversineKm(place, other)))) : Number.POSITIVE_INFINITY;
    const vetoNames = ['Dzhankoy', 'Kursk', 'Zelenodolsk', 'Bikini Atoll', 'Point Barrow'];
    const vetoNameStops = delivery.filter((node) => vetoNames.includes(node.location.name));
    add('Vetoes, duplicates, and separation', vetoed.length === 0 && vetoNameStops.length === 0 && duplicates === 0 && minSeparation >= context.config.minStopSeparationKm,
      vetoNameStops.length || vetoed.length ? `Vetoed stop: ${[...vetoNames, ...vetoed].join(', ')}.` : `no duplicates; nearest pair ${human(minSeparation)} km apart (minimum ${context.config.minStopSeparationKm} km).`);

    const islandIndices = places.flatMap((place, index) => context.config.uninhabitedIslandIds.includes(place.id) ? [index] : []);
    const firstFivePopulated = places.slice(0, 5).every((place) => (place.population ?? 0) > 0 || place.worldCity === true || context.config.openingStopIds.includes(place.id));
    const last = places.at(-1);
    const lastPopulatedOrIconic = !!last && ((last.population ?? 0) > 0 || last.worldCity === true || last.source?.includes('wikidata.org') === true);
    add('Island, opening, and ending rules', islandIndices.length <= 4 && islandIndices.every((index) => index >= 5) && firstFivePopulated && lastPopulatedOrIconic,
      `${islandIndices.length} uninhabited-island stops; first five ${firstFivePopulated ? 'populated' : 'include an unpopulated place'}; last stop ${last?.name ?? 'missing'} ${lastPopulatedOrIconic ? 'is populated or iconic' : 'is not populated or iconic'}.`);

    const sourceFailures = delivery.filter((node) => !node.notes || !/^https?:\/\//.test(node.notes));
    const experienceFailures = delivery.filter((node) => node.stop_experience?.presents_delivered_at_stop !== 1
      || node.stop_experience.camera_zoom == null || !node.stop_experience.weather_condition);
    const legNodes = nodes.filter((node) => node.type !== 'START');
    const transitFailures = legNodes.filter((node) => node.transit_to_here?.duration_seconds == null
      || node.transit_to_here?.distance_km == null || node.transit_to_here?.speed_kmh == null);
    add('Source links and stop experience', sourceFailures.length === 0 && experienceFailures.length === 0 && transitFailures.length === 0,
      `${sourceFailures.length} missing source links; ${experienceFailures.length} incomplete delivery experiences; ${transitFailures.length} missing transit metrics.`);
  } else {
    add('Stop count and category mix', false, 'Cannot check without unique candidate matches.');
    add('Hub definition', false, 'Cannot check without unique candidate matches.');
    add('Timezone and local Christmas arrivals', false, 'Cannot check without unique candidate matches.');
    add('UTC offset coverage', false, 'Cannot check without unique candidate matches.');
    add('Regional quotas and Americas caps', false, 'Cannot check without unique candidate matches.');
    add('Country totals and consecutive runs', false, 'Cannot check without unique candidate matches.');
    add('Vetoes, duplicates, and separation', false, 'Cannot check without unique candidate matches.');
    add('Island, opening, and ending rules', false, 'Cannot check without unique candidate matches.');
    add('Source links and stop experience', false, 'Cannot check without unique candidate matches.');
  }

  const takeoff = Date.parse(TAKEOFF_UTC);
  const stopArrivals = delivery.map((node) => Date.parse(node.schedule.arrival_utc ?? ''));
  const lastDeparture = Date.parse(delivery.at(-1)?.schedule.departure_utc ?? '');
  const returnArrival = Date.parse(end?.schedule.arrival_utc ?? '');
  add('Flight window and North Pole return', !!start && !!end && lastDeparture <= takeoff + 27 * 3_600_000
    && returnArrival <= takeoff + 28 * 3_600_000,
  `last delivery departs ${Number.isFinite(lastDeparture) ? new Date(lastDeparture).toISOString() : 'invalid'}; return ${Number.isFinite(returnArrival) ? new Date(returnArrival).toISOString() : 'invalid'}.`);

  if (matched && start && end && delivery.length === places.length && places.length > 0) {
    const nodesByType = delivery;
    const legs: { km: number; kmh: number; gapMinutes: number; eastward: number; kind: string }[] = [];
    const first = nodesByType[0];
    const firstPlace = places[0];
    if (first && firstPlace) {
      const arrival = Date.parse(first.schedule.arrival_utc ?? '');
      const gapMinutes = (arrival - takeoff) / 60_000;
      const km = haversineKm(NORTH_POLE, firstPlace);
      legs.push({ km, kmh: legSpeedKmh(NORTH_POLE, firstPlace, gapMinutes * 60) ?? 0, gapMinutes, eastward: 0, kind: 'launch' });
    }
    for (let index = 1; index < places.length; index++) {
      const from = places[index - 1];
      const to = places[index];
      const fromNode = nodesByType[index - 1];
      const toNode = nodesByType[index];
      if (!from || !to || !fromNode || !toNode) continue;
      const fromDeparture = Date.parse(fromNode.schedule.departure_utc);
      const toArrival = Date.parse(toNode.schedule.arrival_utc ?? '');
      const gapSeconds = (toArrival - fromDeparture) / 1000;
      const gapMinutes = (toArrival - Date.parse(fromNode.schedule.arrival_utc ?? '')) / 60_000;
      const longitude = ((to.lng - from.lng + 540) % 360) - 180;
      const km = haversineKm(from, to);
      legs.push({ km, kmh: legSpeedKmh(from, to, gapSeconds) ?? 0, gapMinutes, eastward: longitude, kind: 'delivery' });
    }
    const lastPlace = places.at(-1);
    const lastNode = delivery.at(-1);
    if (lastPlace && lastNode) {
      const fromDeparture = Date.parse(lastNode.schedule.departure_utc);
      const gapSeconds = (returnArrival - fromDeparture) / 1000;
      const km = haversineKm(lastPlace, NORTH_POLE);
      legs.push({ km, kmh: legSpeedKmh(lastPlace, NORTH_POLE, gapSeconds) ?? 0, gapMinutes: gapSeconds / 60, eastward: 0, kind: 'return' });
    }
    const speeds = legs.map((leg) => leg.kmh);
    const gaps = stopArrivals.slice(1).map((arrival, index) => (arrival - (stopArrivals[index] ?? arrival)) / 60_000);
    const badGaps = gaps.filter((gap) => gap < context.config.minArrivalGapMinutes || gap > context.config.maxArrivalGapMinutes);
    const maxGap = gaps.length ? Math.max(...gaps) : 0;
    const returnLeg = legs.at(-1);
    const hourly = new Map<number, number>();
    for (const arrival of stopArrivals) {
      const hour = Math.floor((arrival - takeoff) / 3_600_000);
      hourly.set(hour, (hourly.get(hour) ?? 0) + 1);
    }
    const finalHour = Math.floor(((stopArrivals.at(-1) ?? takeoff) - takeoff) / 3_600_000);
    const thinHours = Array.from({ length: Math.max(0, finalHour - 1) }, (_, index) => index + 1)
      .filter((hour) => (hourly.get(hour) ?? 0) < context.config.minimumStopsPerHour);
    add('Arrival pacing and quiet gaps', badGaps.length === 0 && maxGap <= context.config.maxArrivalGapMinutes
      && !!returnLeg && returnLeg.gapMinutes <= 60,
    `arrival gaps ${gaps.length ? `${human(Math.min(...gaps))}–${human(maxGap)} min` : 'missing'}; return gap ${human(returnLeg?.gapMinutes ?? Number.POSITIVE_INFINITY)} min.`);
    add('Clock-hour coverage', thinHours.length === 0,
      thinHours.length ? `under ${context.config.minimumStopsPerHour} stops in UTC flight hours ${thinHours.join(', ')}.` : `at least ${context.config.minimumStopsPerHour} stops in each complete interior UTC flight hour.`);
    const med = percent(speeds, 0.5);
    const p90 = percent(speeds, 0.9);
    const maximum = Math.max(...speeds);
    const transitSpeeds = nodes.filter((node) => node.type !== 'START')
      .map((node) => node.transit_to_here?.speed_kmh)
      .filter((speed): speed is number => speed !== undefined && speed !== null);
    const reportedMaximum = transitSpeeds.length ? Math.max(...transitSpeeds) : Number.POSITIVE_INFINITY;
    add('Leg-speed targets', med >= context.config.medianLegSpeedMinKmh && med <= context.config.medianLegSpeedMaxKmh
      && p90 <= context.config.p90LegSpeedMaxKmh && maximum <= context.config.maxLegSpeedKmh
      && reportedMaximum <= context.config.maxLegSpeedKmh,
    `median ${human(med)} km/h; p90 ${human(p90)} km/h; max ${human(maximum)} km/h calculated and ${human(reportedMaximum)} km/h stored.`);
    const pathKm = legs.reduce((sum, leg) => sum + leg.km, 0);
    const eastward = legs.filter((leg) => leg.kind === 'delivery' && leg.eastward > 8).length;
    add('Route length and eastward backtracking', pathKm <= context.config.maxRouteDistanceKm && eastward <= 3,
      `${human(pathKm)} km total including launch and return; ${eastward} delivery legs move east more than 8°.`);
  } else {
    add('Arrival pacing and quiet gaps', false, 'Cannot calculate paced legs.');
    add('Clock-hour coverage', false, 'Cannot calculate hourly stop counts.');
    add('Leg-speed targets', false, 'Cannot calculate leg speeds.');
    add('Route length and eastward backtracking', false, 'Cannot calculate the path.');
  }

  return { checks, pass: checks.every((check) => check.pass) };
}
