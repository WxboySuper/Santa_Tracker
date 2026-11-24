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
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === 'ENOENT';
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

export async function loadGeneratorInputs(options: { seed?: number; total?: number; overrides?: RouteOverrides } = {}): Promise<GeneratorInputs> {
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
    total: options.total ?? DEFAULT_GENERATOR_LIMITS.total,
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
    transit_to_here?: { distance_km?: number | null; speed_kmh?: number | null } | null;
    comment: string;
  }[];
  const stopRows = generated.locations.map((place, index) => {
    const node = deliveryNodes[index];
    const country = countryNames[place.country] ?? place.country;
    return `<tr><td>${index + 1}</td><td>${escapeHtml(place.name)}</td><td>${escapeHtml(country)}</td><td>${escapeHtml(node?.schedule.arrival_utc ?? '')}</td><td>${escapeHtml(node?.schedule.local_arrival_time ?? '')}</td><td>${escapeHtml(place.timezone)}</td><td>${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}</td><td>${escapeHtml(place.category)}</td><td>${node?.transit_to_here?.distance_km ?? ''}</td><td>${node?.transit_to_here?.speed_kmh ?? ''}</td><td>${linkCell(place.source)}</td></tr>`;
  });
  const transitNodes = generated.document.route_nodes.slice(1) as {
    transit_to_here?: { distance_km?: number | null; speed_kmh?: number | null } | null;
  }[];
  const legRows = generated.report.legs.map((leg, index) => {
    const transit = transitNodes[index]?.transit_to_here;
    return `<tr><td>${index + 1}</td><td>${escapeHtml(leg.kind)}</td><td>${escapeHtml(leg.from)}</td><td>${escapeHtml(leg.to)}</td><td>${transit?.distance_km ?? ''}</td><td>${Math.round(leg.gapMinutes)}</td><td>${transit?.speed_kmh ?? ''}</td></tr>`;
  });
  const categoryRows = Object.entries(generated.report.mix).map(([category, entry]) => `<tr><td>${escapeHtml(category)}</td><td>${entry.count}</td><td>${entry.target}</td></tr>`);
  const continentRows = Object.entries(generated.report.continentBalance).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `<tr><td>${escapeHtml(name)}</td><td>${count}</td></tr>`);
  const subregionRows = Object.entries(generated.report.subregionBalance).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `<tr><td>${escapeHtml(name)}</td><td>${count}</td></tr>`);
  const offsetRows = Object.entries(generated.report.offsetBalance).sort(([a], [b]) => a.localeCompare(b)).map(([offset, count]) => `<tr><td>${escapeHtml(offset)}</td><td>${count}</td></tr>`);
  const hourRows = generated.report.hourly.map((entry) => `<tr><td>${entry.hour}</td><td>${entry.count}</td></tr>`);
  const ownerRows = config.ownerDecisionIds.map((id) => {
    const place = generated.locations.find((candidate) => candidate.id === id) ?? inputs.pool.find((candidate) => candidate.id === id);
    return place ? `<li>${escapeHtml(place.name)} (${escapeHtml(countryNames[place.country] ?? place.country)})</li>` : `<li>Missing owner decision stop ${escapeHtml(id)}</li>`;
  });
  const warningRows = generated.report.issues.length
    ? generated.report.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`)
    : ['<li>No generator warnings.</li>'];
  const summary = `${generated.report.count} delivery stops. Total route length ${Math.round(generated.report.totalDistanceKm).toLocaleString('en-US')} km, including the launch and return. Median leg speed ${Math.round(generated.report.medianLegSpeedKmh).toLocaleString('en-US')} km/h, p90 ${Math.round(generated.report.p90LegSpeedKmh).toLocaleString('en-US')} km/h, maximum ${Math.round(generated.report.maxLegSpeedKmh).toLocaleString('en-US')} km/h. Last delivery departure ${escapeHtml(generated.report.lastDepartureUtc)}. North Pole return ${escapeHtml(generated.report.routeEndUtc)}.`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>2026 Santa route draft review</title><style>body{font:15px/1.5 system-ui,sans-serif;margin:2rem;color:#17212b}h1,h2{color:#123b52}table{border-collapse:collapse;margin:1rem 0 2rem;width:100%;white-space:nowrap}th,td{border:1px solid #ccd5dc;padding:.4rem .55rem;text-align:left}th{background:#e7f0f4;cursor:pointer}section{overflow:auto}.summary{max-width:75rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(20rem,1fr));gap:1rem}#filter{padding:.6rem;width:min(28rem,90%)}a{color:#075985}</style></head><body><h1>2026 Santa route draft</h1><p class="summary">Seed ${config.seed}. Generated offline from committed snapshots. ${summary}</p><div class="grid">${table('Category mix',['Category','Actual','Target'],categoryRows)}${table('Stops by continent',['Continent','Stops'],continentRows)}${table('Stops by subregion',['Subregion','Stops'],subregionRows)}${table('Stops by UTC offset',['UTC offset','Stops'],offsetRows)}${table('Stops by UTC flight hour',['Hours after takeoff','Stops'],hourRows)}</div><h2>Warnings</h2><ul>${warningRows.join('')}</ul><h2>Owner decisions</h2><ul>${ownerRows.join('')}</ul><h2>Stops</h2><input id="filter" placeholder="Filter by stop, country, timezone, or source"><section><table id="stops"><thead><tr>${['Order','Name','Country','UTC arrival','Local arrival','Timezone','Lat, lon','Category','Leg km','Leg km/h','Source'].map((name) => `<th>${escapeHtml(name)}</th>`).join('')}</tr></thead><tbody>${stopRows.join('')}</tbody></table></section>${table('Every leg, including launch and return',['#','Type','From','To','Distance km','Arrival gap min','Speed km/h'],legRows)}<script>document.querySelectorAll('table').forEach(table=>table.querySelectorAll('th').forEach(th=>th.addEventListener('click',()=>{const body=table.tBodies[0];const index=[...table.querySelectorAll('th')].indexOf(th);const rows=[...body.rows];rows.sort((a,b)=>a.cells[index].textContent.localeCompare(b.cells[index].textContent,undefined,{numeric:true}));rows.forEach(row=>body.append(row))})));document.querySelector('#filter').addEventListener('input',event=>document.querySelectorAll('#stops tbody tr').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(event.target.value.toLowerCase())))</script></body></html>`;
  return html;
}

export function formatOffset(offsetMinutes: number): string {
  return formatUtcOffset(offsetMinutes);
}
