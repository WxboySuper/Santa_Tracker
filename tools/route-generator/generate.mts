import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateRoute, DEFAULT_GENERATOR_LIMITS, type Candidate, type GeneratorConfig } from '../../packages/route-engine/src/generate/generator';
import { haversineKm, legSpeedKmh } from '../../packages/route-engine/src/geo';

const args = process.argv.slice(2);
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const seed = Number(option('--seed') ?? DEFAULT_GENERATOR_LIMITS.seed);
const total = Number(option('--total') ?? DEFAULT_GENERATOR_LIMITS.total);
if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(total) || total < 1) throw new Error('Seed and total must be positive integers');
const [routeConfig, places, curated] = await Promise.all([
  readFile(new URL('./config.json', import.meta.url), 'utf8').then((value) => JSON.parse(value) as Partial<GeneratorConfig>),
  readFile(new URL('./data/places.json', import.meta.url), 'utf8').then((value) => JSON.parse(value) as Candidate[]),
  readFile(new URL('./data/curated.json', import.meta.url), 'utf8').then((value) => JSON.parse(value) as Candidate[]),
]);
const underservedCountries = new Set(['Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cameroon', 'Central African Republic', 'Chad', 'Comoros', 'Congo', 'Democratic Republic of the Congo', 'Djibouti', 'Eritrea', 'Eswatini', 'Ethiopia', 'Gabon', 'Gambia', 'Ghana', 'Guinea', 'Kenya', 'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Mozambique', 'Namibia', 'Niger', 'Nigeria', 'Rwanda', 'Senegal', 'Sierra Leone', 'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Uganda', 'Zambia', 'Zimbabwe', 'Afghanistan', 'Kazakhstan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Uzbekistan', 'Bolivia', 'Paraguay', 'Guyana', 'Suriname', 'Papua New Guinea', 'Fiji', 'Samoa', 'Tonga']);
const populated = places.map((place) => ({ ...place, category: place.worldCity ? 'hub' : underservedCountries.has(place.country) ? 'underserved' : 'hub' }));
const pool = [...populated, ...curated];
const overridesPath = option('--overrides');
const overrides = overridesPath ? JSON.parse(await readFile(resolve(overridesPath), 'utf8')) : {};
const settings = { ...DEFAULT_GENERATOR_LIMITS, ...routeConfig, seed, total } as GeneratorConfig;
const generated = generateRoute(pool, settings, overrides);
const outputDir = resolve('tools/route-generator/out');
await mkdir(outputDir, { recursive: true });
const draft = JSON.stringify(generated.document, null, 2);
const report = generated.report;
const nodes = generated.document.route_nodes;
const locations = generated.locations;
const tableRows = nodes.map((value, index) => {
  const node = value as { id: string; location: { name: string; region: string; lat: number; lng: number; timezone_offset: number }; schedule: { arrival_utc: string; departure_utc: string }; comment: string };
  const place = locations[index];
  const previous = locations[index - 1];
  const km = previous && place ? haversineKm(previous, place) : 0;
  const priorNode = nodes[index - 1] as typeof node | undefined;
  const travelSeconds = priorNode ? (Date.parse(node.schedule.arrival_utc) - Date.parse(priorNode.schedule.departure_utc)) / 1000 : 0;
  const speed = previous && place ? Math.round(legSpeedKmh(previous, place, travelSeconds) ?? 0) : 0;
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: place?.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(node.schedule.arrival_utc));
  return `<tr><td>${index + 1}</td><td>${escapeHtml(place?.id ?? '')}</td><td>${escapeHtml(node.location.name)}</td><td>${escapeHtml(node.comment)}</td><td>${escapeHtml(node.location.region)}</td><td>${local}</td><td>${Math.round(km)}</td><td>${speed}</td><td>${km > settings.maxGapKm ? 'long gap' : ''}</td><td>${speed > settings.maxSpeedKmh ? 'fast leg' : ''}</td><td>${index > 0 && locations[index - 1]?.country === place?.country ? 'repeat country' : ''}</td></tr>`;
}).join('');
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char); }
const mixRows = Object.entries(report.mix).map(([category, entry]) => `<tr><td>${escapeHtml(category)}</td><td>${entry.count}</td><td>${entry.target}</td></tr>`).join('');
const regionRows = Object.entries(report.regionBalance).sort((a, b) => a[0].localeCompare(b[0])).map(([region, count]) => `<tr><td>${escapeHtml(region)}</td><td>${count}</td></tr>`).join('');
const hourlyRows = report.hourly.map((entry) => `<tr><td>${entry.hour}</td><td>${entry.count}</td></tr>`).join('');
const longestRows = report.longestLegs.map((leg) => `<tr><td>${leg.from}</td><td>${leg.to}</td><td>${Math.round(leg.km)}</td><td>${Math.round(leg.kmh)}</td></tr>`).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Santa route ${seed} review</title><style>body{font:15px system-ui;margin:2rem;color:#17212b}h1,h2{color:#123b52}table{border-collapse:collapse;margin:1rem 0 2rem;width:100%}th,td{border:1px solid #ccd5dc;padding:.45rem;text-align:left}th{background:#e7f0f4;cursor:pointer}section{overflow:auto}.summary{display:flex;gap:3rem;flex-wrap:wrap}.summary table{width:auto}#filter{padding:.6rem;width:min(28rem,90%)}</style><h1>2026 Santa route review</h1><p>Seed ${seed} · ${report.count} stops · generated offline from committed snapshots.</p><div class="summary"><section><h2>Category mix</h2><table><thead><tr><th>Category</th><th>Actual</th><th>Target</th></tr></thead><tbody>${mixRows}</tbody></table></section><section><h2>Timezone region balance</h2><table><thead><tr><th>Region</th><th>Stops</th></tr></thead><tbody>${regionRows}</tbody></table></section><section><h2>Stops per hour</h2><table><thead><tr><th>Hour from first arrival</th><th>Stops</th></tr></thead><tbody>${hourlyRows}</tbody></table></section><section><h2>Longest legs</h2><table><thead><tr><th>From</th><th>To</th><th>Km</th><th>Km/h</th></tr></thead><tbody>${longestRows}</tbody></table></section></div><p>Fastest leg: ${report.fastestLeg ? `${Math.round(report.fastestLeg.kmh)} km/h` : 'none'}. Last ${settings.westernHours} hours minimum: ${report.westernMinimum} stops/hour. ${report.issues.map(escapeHtml).join('<br>')}</p><h2>Stops</h2><input id="filter" placeholder="Filter stops"><section><table id="stops"><thead><tr>${['#', 'Candidate ID', 'Stop', 'Category', 'Country', 'Local arrival', 'Leg km', 'Leg km/h', 'Long gap', 'Fast leg', 'Repeat country'].map((label) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table></section><script>document.querySelectorAll('th').forEach((th,i)=>th.addEventListener('click',()=>{const body=th.closest('table').tBodies[0];const rows=[...body.rows];rows.sort((a,b)=>a.cells[i].textContent.localeCompare(b.cells[i].textContent,undefined,{numeric:true}));rows.forEach(r=>body.append(r))}));document.querySelector('#filter').addEventListener('input',e=>document.querySelectorAll('#stops tbody tr').forEach(r=>r.hidden=!r.textContent.toLowerCase().includes(e.target.value.toLowerCase())))</script></html>`;
await writeFile(resolve(outputDir, 'santa_route.json'), `${draft}\n`);
await writeFile(resolve(outputDir, 'review.html'), html);
console.log(JSON.stringify({ seed, count: report.count, mix: report.mix, westernHourly: report.hourly.slice(-settings.westernHours), westernMinimum: report.westernMinimum, fastestLeg: report.fastestLeg, outputDir }, null, 2));
