import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { RouteSchema } from '@santa-tracker/contracts';
import { validateRoute } from '../../packages/route-engine/src/validate';
import { auditRouteDocument, type AuditCheck } from '../../packages/route-engine/src/generate/audit';
import { generateDraft, loadGeneratorInputs, renderReview, serializeDraft } from './generate-core';
import { loadRouteNodesRaw, validateLocations } from '../../apps/web/src/lib/locations';
import { routeNodesToContractRoute } from '../../apps/web/src/lib/route-bridge';
import { validRouteNodes } from '../../apps/web/src/lib/tracker-route-validation';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
if (resolve(process.cwd()) !== root) throw new Error(`Run pnpm route:audit from the repository root: ${root}`);

const routePath = resolve(root, 'docs/planning/route-2026-draft/route.json');
const reviewPath = resolve(root, 'docs/planning/route-2026-draft/review.html');
const inputs = await loadGeneratorInputs({ seed: 2026, total: 160 });
const generated = generateDraft(inputs);
const checks: AuditCheck[] = [];
const add = (name: string, pass: boolean, detail: string): void => { checks.push({ name, pass, detail }); };
let committedRouteText = '';
let committedReviewText = '';
let document: unknown;

try {
  committedRouteText = await readFile(routePath, 'utf8');
  document = JSON.parse(committedRouteText) as unknown;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  add('Committed draft file', false, message);
}
try {
  committedReviewText = await readFile(reviewPath, 'utf8');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  add('Review page', false, message);
}

if (document !== undefined) {
  const mechanical = auditRouteDocument(document, {
    config: inputs.config,
    pool: inputs.pool,
    selected: generated.locations,
    zonesByCountry: inputs.tables.zonesByCountry,
    utcOffsetsByTimezone: inputs.tables.utcOffsetsByTimezone,
    countryBoundsByCode: inputs.tables.countryBoundsByCode,
    report: generated.report,
    vetoIds: [...inputs.overrides.veto ?? []],
  });
  checks.push(...mechanical.checks);

  const rawNodes = await loadRouteNodesRaw(JSON.stringify(document));
  const filteredNodes = validRouteNodes(isObject(document) && Array.isArray(document.route_nodes) ? document.route_nodes : null);
  const deliveryNodes = rawNodes.filter((node) => node.type === 'DELIVERY');
  const locationValidation = validateLocations(deliveryNodes);
  const converted = routeNodesToContractRoute(rawNodes);
  add('App route loader', rawNodes.length === 162 && filteredNodes.length === 162,
    `loadRouteNodesRaw returned ${rawNodes.length}; validRouteNodes retained ${filteredNodes.length}.`);
  add('App location validator', locationValidation.valid,
    locationValidation.valid ? `${locationValidation.total_locations} delivery nodes pass location validation.` : locationValidation.errors.slice(0, 4).join('; '));
  const routeParse = RouteSchema.safeParse(converted.route);
  add('App contract route schema', routeParse.success,
    routeParse.success ? `${converted.route.stops.length} timed stops pass RouteSchema.` : 'The app route bridge output fails RouteSchema.');
  const engineValidation = validateRoute(converted.route);
  add('Route engine validator', engineValidation.ok,
    engineValidation.ok ? 'Converted contract route passes chronology and schema validation.' : engineValidation.issues.map((issue) => issue.message).join('; '));
}

const requiredReviewFields = [
  'Order', 'Name', 'Country', 'UTC arrival', 'Local arrival', 'Timezone', 'Lat, lon', 'Category', 'Source',
  'Owner decisions', 'Stops', 'UTC offset', 'Every leg, including launch and return',
];
const missingReviewFields = requiredReviewFields.filter((field) => !committedReviewText.includes(field));
const ownerNames = ['Timbuktu', 'Leptis Magna', 'Robben Island'];
const missingOwnerNames = ownerNames.filter((name) => !committedReviewText.includes(name));
add('Review page contents', committedReviewText.length > 0 && missingReviewFields.length === 0 && missingOwnerNames.length === 0,
  missingReviewFields.length || missingOwnerNames.length
    ? `missing ${[...missingReviewFields, ...missingOwnerNames].join(', ')}.`
    : 'Per-stop fields, all legs, owner decisions, and named owner stops are present.');

if (committedRouteText && committedReviewText) {
  const scratch = await mkdtemp(join(tmpdir(), 'santa-route-audit-'));
  try {
    const scratchRoute = join(scratch, 'route.json');
    const scratchReview = join(scratch, 'review.html');
    await Promise.all([
      writeFile(scratchRoute, serializeDraft(generated), 'utf8'),
      writeFile(scratchReview, renderReview(generated, inputs), 'utf8'),
    ]);
    const [expectedRouteHash, actualRouteHash, expectedReviewHash, actualReviewHash] = await Promise.all([
      hashFile(scratchRoute), hashText(committedRouteText), hashFile(scratchReview), hashText(committedReviewText),
    ]);
    add('Deterministic snapshot regeneration', expectedRouteHash === actualRouteHash && expectedReviewHash === actualReviewHash,
      `route ${expectedRouteHash === actualRouteHash ? 'matches' : 'differs'}; review ${expectedReviewHash === actualReviewHash ? 'matches' : 'differs'}; sha256 ${actualRouteHash}.`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
} else {
  add('Deterministic snapshot regeneration', false, 'Committed route or review file is missing.');
}

const nameWidth = Math.max(...checks.map((check) => check.name.length), 'Check'.length);
console.log(`| ${'Check'.padEnd(nameWidth)} | Result | Detail |`);
console.log(`|-${'-'.repeat(nameWidth)}-|--------|--------|`);
for (const check of checks) console.log(`| ${check.name.padEnd(nameWidth)} | ${check.pass ? 'PASS' : 'FAIL'}   | ${check.detail.replaceAll('|', '\\|')} |`);
console.log(`\n${checks.filter((check) => check.pass).length}/${checks.length} checks passed.`);
if (checks.some((check) => !check.pass)) process.exitCode = 1;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function hashFile(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
