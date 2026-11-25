import { readFile } from 'node:fs/promises';
import { generateRoute, DEFAULT_GENERATOR_LIMITS, type Candidate, type GeneratedRoute, type GeneratorConfig } from '../../packages/route-engine/src/generate/generator';
import type { RouteOverrides } from '../../packages/route-engine/src/generate/overrides';
import { formatUtcOffset } from '../../packages/route-engine/src/generate/regions';

export type TimezoneTables = {
  tzdbVersion: string;
  zonesByCountry: Record<string, string[]>;
  zonePointsByCountry: Record<string, { timezone: string; lat: number; lng: number }[]>;
  utcOffsetsByTimezone: Record<string, number>;
  countryNames: Record<string, string>;
  countryBoundsByCode: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }>;
};

export type GeneratorInputs = {
  config: GeneratorConfig;
  pool: Candidate[];
  overrides: RouteOverrides;
  tables: TimezoneTables;
  countryNames: Record<string, string>;
};

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, 'utf8')) as T;
}

async function readOptionalJson<T>(url: URL, fallback: T): Promise<T> {
  try {
    return await readJson<T>(url);
  } catch (error) {
    return fallbackForMissingFile(error, fallback);
  }
}

function fallbackForMissingFile<T>(error: unknown, fallback: T): T {
  if (isMissingFileError(error)) return fallback;
  throw error;
}

function isMissingFileError(error: unknown): boolean {
  if (typeof error !== 'object') return false;
  if (error === null) return false;
  if (!hasErrorCode(error)) return false;
  return error.code === 'ENOENT';
}

function hasErrorCode(error: object): error is { code: unknown } {
  return 'code' in error;
}

function mergeOverrideFiles(base: RouteOverrides, extra: RouteOverrides): RouteOverrides {
  return {
    lock: [...new Set([...(base.lock ?? []), ...(extra.lock ?? [])])],
    veto: [...new Set([...(base.veto ?? []), ...(extra.veto ?? [])])],
    swap: { ...base.swap, ...extra.swap },
    timezone: { ...base.timezone, ...extra.timezone },
    utcOffsetMinutes: { ...base.utcOffsetMinutes, ...extra.utcOffsetMinutes },
    rename: { ...base.rename, ...extra.rename },
  };
}

export async function loadGeneratorInputs(options: { seed?: number; overrides?: RouteOverrides } = {}): Promise<GeneratorInputs> {
  const [routeConfig, places, curated, draftOverrides, localOverrides, tables, countryNames, countryBounds] = await Promise.all([
    readJson<Partial<GeneratorConfig>>(new URL('./config.json', import.meta.url)),
    readJson<Candidate[]>(new URL('./data/places.json', import.meta.url)),
    readJson<Candidate[]>(new URL('./data/curated.json', import.meta.url)),
    readJson<RouteOverrides>(new URL('./data/route-2026-overrides.json', import.meta.url)),
    readOptionalJson<RouteOverrides>(new URL('./overrides.json', import.meta.url), {}),
    readJson<TimezoneTables>(new URL('./data/country-zones.json', import.meta.url)),
    readJson<Record<string, string>>(new URL('./data/country-names.json', import.meta.url)),
    readJson<{ boundsByCountry: TimezoneTables['countryBoundsByCode'] }>(new URL('./data/country-bounds.json', import.meta.url)),
  ]);
  const config = {
    ...DEFAULT_GENERATOR_LIMITS,
    ...routeConfig,
    seed: options.seed ?? DEFAULT_GENERATOR_LIMITS.seed,
  } as GeneratorConfig;
  const pool = [
    ...places.map((place) => ({ ...place, category: 'populated' })),
    ...curated,
  ];
  return {
    config,
    pool,
    overrides: mergeOverrideFiles(mergeOverrideFiles(draftOverrides, localOverrides), options.overrides ?? {}),
    tables: { ...tables, countryNames, countryBoundsByCode: countryBounds.boundsByCountry },
    countryNames,
  };
}

export function generateDraft(inputs: GeneratorInputs): GeneratedRoute {
  return generateRoute(inputs.pool, inputs.config, inputs.overrides, inputs.tables);
}

export function serializeDraft(generated: GeneratedRoute): string {
  return `${JSON.stringify(generated.document, null, 2)}\n`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function linkCell(url: string | undefined): string {
  if (!url) return 'No source link';
  return `<a href="${escapeHtml(url)}" rel="noreferrer">Source</a>`;
}

function table(title: string, headers: string[], rows: string[]): string {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  return `<section><h2>${escapeHtml(title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></section>`;
}

export function renderReview(generated: GeneratedRoute, inputs: GeneratorInputs): string {
  const { config, countryNames } = inputs;
  const deliveryNodes = generated.document.route_nodes.slice(1, -1) as {
    id: string;
    type: string;
    location: { name: string; country_code: string; lat: number; lng: number; timezone_offset: number };
    schedule: { arrival_utc: string; departure_utc: string; local_arrival_time: string };
    transit_to_here?: { distance_km?: number | null; speed_kmh?: number | null; eastward_reason?: string } | null;
    stop_experience?: { stop_tier?: string; duration_seconds?: number };
    comment: string;
  }[];
  const stopRows = generated.locations.map((place, index) => {
    const node = deliveryNodes[index];
    const country = countryNames[place.country] ?? place.country;
    return `<tr><td>${index + 1}</td><td>${escapeHtml(place.name)}</td><td>${escapeHtml(country)}</td><td>${escapeHtml(node?.schedule.arrival_utc ?? '')}</td><td>${escapeHtml(node?.schedule.local_arrival_time ?? '')}</td><td>${escapeHtml(place.timezone)}</td><td>${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}</td><td>${escapeHtml(place.category)}</td><td>${escapeHtml(node?.stop_experience?.stop_tier ?? '')}</td><td>${node?.stop_experience?.duration_seconds ?? ''}</td><td>${node?.transit_to_here?.distance_km ?? ''}</td><td>${node?.transit_to_here?.speed_kmh ?? ''}</td><td>${escapeHtml(node?.transit_to_here?.eastward_reason ?? '')}</td><td>${linkCell(place.source)}</td></tr>`;
  });
  const transitNodes = generated.document.route_nodes.slice(1) as {
    transit_to_here?: { distance_km?: number | null; speed_kmh?: number | null; eastward_reason?: string } | null;
  }[];
  const legRows = generated.report.legs.map((leg, index) => {
    const transit = transitNodes[index]?.transit_to_here;
    return `<tr><td>${index + 1}</td><td>${escapeHtml(leg.kind)}</td><td>${escapeHtml(leg.from)}</td><td>${escapeHtml(leg.to)}</td><td>${transit?.distance_km ?? ''}</td><td>${Math.round(leg.gapMinutes)}</td><td>${transit?.speed_kmh ?? ''}</td><td>${escapeHtml(transit?.eastward_reason ?? '')}</td></tr>`;
  });
  const categoryRows = Object.entries(generated.report.mix).map(([category, count]) => `<tr><td>${escapeHtml(category)}</td><td>${count}</td></tr>`);
  const tierRows = Object.entries(generated.report.stopTiers).map(([tier, count]) => `<tr><td>${escapeHtml(tier)}</td><td>${count}</td></tr>`);
  const continentRows = Object.entries(generated.report.continentBalance).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `<tr><td>${escapeHtml(name)}</td><td>${count}</td></tr>`);
  const subregionRows = Object.entries(generated.report.subregionBalance).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `<tr><td>${escapeHtml(name)}</td><td>${count}</td></tr>`);
  const offsetRows = Object.entries(generated.report.offsetBalance).sort(([a], [b]) => a.localeCompare(b)).map(([offset, count]) => `<tr><td>${escapeHtml(offset)}</td><td>${count}</td></tr>`);
  const hourRows = generated.report.hourly.map((entry) => `<tr><td>${entry.hour}</td><td>${entry.count}</td></tr>`);
  const warningRows = generated.report.issues.length
    ? generated.report.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`)
    : ['<li>No generator warnings.</li>'];
  const ownerDecisionRows = [
    ['Sweep', 'Follow local midnight west; prioritize new country coverage and add feasible stops.'],
    ['Arrival window', 'Arrive from 23:00 to 05:00 local; aim for 01:00 when travel allows.'],
    ['Pacing', '20,000 km/h p90 and 25,000 km/h hard maximum; no extra arrival gap.'],
    ['Separation', 'Keep selected stops at least 20 km apart.'],
    ['Dwell', 'Major 60 s, city 30 s, town 10 s, hop 3 s.'],
    ['Country limit', 'At most six stops per country to preserve coverage across the full route.'],
  ].map(([decision, applied]) => `<tr><td>${escapeHtml(decision ?? '')}</td><td>${escapeHtml(applied ?? '')}</td></tr>`);
  const tierSummary = Object.entries(generated.report.stopTiers).map(([tier, count]) => `${tier} ${count}`).join(', ');
  const coverage = (generated.report.populationCoverageWithin500Km * 100).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const summary = `${generated.report.count} delivery stops across ${generated.report.countriesCovered} countries and territories. Stop tiers: ${tierSummary}. Path length ${Math.round(generated.report.totalDistanceKm).toLocaleString('en-US')} km. Leg speeds: median ${Math.round(generated.report.medianLegSpeedKmh).toLocaleString('en-US')} km/h, p90 ${Math.round(generated.report.p90LegSpeedKmh).toLocaleString('en-US')} km/h, maximum ${Math.round(generated.report.maxLegSpeedKmh).toLocaleString('en-US')} km/h. ${coverage}% of the population estimate in the candidate snapshot is within 500 km of a stop. Last departure ${escapeHtml(generated.report.lastDepartureUtc)}. North Pole return ${escapeHtml(generated.report.routeEndUtc)}.`;
  const localRows = Object.entries(generated.report.localArrivalHistogram).map(([hour, count]) => `<tr><td>${escapeHtml(hour)}</td><td>${count}</td></tr>`);
  const eastwardRows = generated.report.eastwardLegs.map((leg) => `<tr><td>${escapeHtml(leg.from)}</td><td>${escapeHtml(leg.to)}</td><td>${leg.eastwardDegrees.toFixed(1)}</td><td>${escapeHtml(leg.eastwardReason ?? '')}</td></tr>`);
  const detourRows = generated.report.detours.map((item) => `<tr><td>${escapeHtml(item.from)}</td><td>${escapeHtml(item.via)}</td><td>${escapeHtml(item.to)}</td><td>${item.ratio.toFixed(2)}</td></tr>`);
  const longestRows = generated.report.longestLegs.map((leg) => `<tr><td>${escapeHtml(leg.kind)}</td><td>${escapeHtml(leg.from)}</td><td>${escapeHtml(leg.to)}</td><td>${Math.round(leg.km)}</td><td>${Math.round(leg.kmh)}</td><td>${escapeHtml(leg.eastwardReason ?? '')}</td></tr>`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>2026 Santa route draft review</title><style>body{font:15px/1.5 system-ui,sans-serif;margin:2rem;color:#17212b}h1,h2{color:#123b52}table{border-collapse:collapse;margin:1rem 0 2rem;width:100%;white-space:nowrap}th,td{border:1px solid #ccd5dc;padding:.4rem .55rem;text-align:left}th{background:#e7f0f4;cursor:pointer}section{overflow:auto}.summary{max-width:75rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(20rem,1fr));gap:1rem}#filter{padding:.6rem;width:min(28rem,90%)}a{color:#075985}</style></head><body><h1>2026 Santa route draft</h1><p class="summary">Seed ${config.seed}. Generated offline from committed snapshots. ${summary}</p><div class="grid">${table('Stop tiers',['Tier','Stops'],tierRows)}${table('Category tie-break mix',['Category','Stops'],categoryRows)}${table('Stops by continent',['Continent','Stops'],continentRows)}${table('Stops by subregion',['Subregion','Stops'],subregionRows)}${table('Stops by UTC offset',['UTC offset','Stops'],offsetRows)}${table('Local arrival histogram',['Local hour','Stops'],localRows)}${table('Stops by UTC flight hour',['Hours after takeoff','Stops'],hourRows)}</div>${table('Owner decisions',['Decision','Applied'],ownerDecisionRows)}<h2>Warnings</h2><ul>${warningRows.join('')}</ul><h2>Eastward legs</h2>${table('Every eastward leg and its reason',['From','To','Degrees','Reason'],eastwardRows.length ? eastwardRows : ['<tr><td colspan="4">None</td></tr>'])}<h2>Detours over 2.5x</h2>${table('Detour checks',['From','Via','To','Ratio'],detourRows.length ? detourRows : ['<tr><td colspan="4">None</td></tr>'])}${table('20 longest legs',['Type','From','To','Distance km','Speed km/h','Eastward reason'],longestRows)}<h2>Stops</h2><input id="filter" placeholder="Filter by stop, country, timezone, or source"><section><table id="stops"><thead><tr>${['Order','Name','Country','UTC arrival','Local arrival','Timezone','Lat, lon','Category','Tier','Dwell seconds','Leg km','Leg km/h','Eastward reason','Source'].map((name) => `<th>${escapeHtml(name)}</th>`).join('')}</tr></thead><tbody>${stopRows.join('')}</tbody></table></section>${table('Every leg, including launch and return',['#','Type','From','To','Distance km','Arrival gap min','Speed km/h','Eastward reason'],legRows)}<script>document.querySelectorAll('table').forEach(table=>table.querySelectorAll('th').forEach((th,index)=>th.addEventListener('click',()=>{const body=table.tBodies[0];const rows=[...body.rows];rows.sort((a,b)=>a.cells[index].textContent.localeCompare(b.cells[index].textContent,undefined,{numeric:true}));rows.forEach(row=>body.append(row))})));document.querySelector('#filter').addEventListener('input',event=>document.querySelectorAll('#stops tbody tr').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(event.target.value.toLowerCase())))</script></body></html>`;
  return html;
}

export function formatOffset(offsetMinutes: number): string {
  return formatUtcOffset(offsetMinutes);
}
