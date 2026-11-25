import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { RouteOverrides } from '../../packages/route-engine/src/generate/overrides';
import { generateDraft, loadGeneratorInputs, renderReview, serializeDraft } from './generate-core';

const repositoryRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
if (resolve(process.cwd()) !== repositoryRoot) {
  throw new Error(`Run pnpm route:generate from the repository root: ${repositoryRoot}`);
}

const args = process.argv.slice(2);
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

const seed = Number(option('--seed') ?? 2026);
if (!Number.isSafeInteger(seed)) {
  throw new Error('Seed must be a safe integer');
}
const extraOverrides = option('--overrides')
  ? JSON.parse(await readFile(resolve(option('--overrides') ?? ''), 'utf8')) as RouteOverrides
  : undefined;
const outputDir = resolve(option('--output-dir') ?? 'docs/planning/route-2026-draft');
const draftDir = resolve(repositoryRoot, 'docs/planning/route-2026-draft');
const tempRoot = resolve(tmpdir());
const isDraftOutput = outputDir === draftDir || outputDir.startsWith(`${draftDir}${sep}`);
const isScratchOutput = outputDir === tempRoot || outputDir.startsWith(`${tempRoot}${sep}`);
if (!isDraftOutput && !isScratchOutput) {
  throw new Error('Route generator output must be under docs/planning/route-2026-draft or the operating-system temp directory');
}

const inputs = await loadGeneratorInputs({
  seed,
  overrides: extraOverrides,
});
const generated = generateDraft(inputs);
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, 'route.json'), serializeDraft(generated), 'utf8'),
  writeFile(resolve(outputDir, 'review.html'), renderReview(generated, inputs), 'utf8'),
]);
console.log(JSON.stringify({
  seed,
  stops: generated.report.count,
  countriesCovered: generated.report.countriesCovered,
  stopTiers: generated.report.stopTiers,
  continentBalance: generated.report.continentBalance,
  offsetBalance: generated.report.offsetBalance,
  medianLegSpeedKmh: generated.report.medianLegSpeedKmh,
  p90LegSpeedKmh: generated.report.p90LegSpeedKmh,
  maxLegSpeedKmh: generated.report.maxLegSpeedKmh,
  totalDistanceKm: Math.round(generated.report.totalDistanceKm),
  localArrivalHistogram: generated.report.localArrivalHistogram,
  eastwardLegs: generated.report.eastwardLegs,
  longestLegs: generated.report.longestLegs,
  populationCoverageWithin500Km: generated.report.populationCoverageWithin500Km,
  lastDepartureUtc: generated.report.lastDepartureUtc,
  routeEndUtc: generated.report.routeEndUtc,
  outputDir: relative(repositoryRoot, outputDir) || '.',
}, null, 2));
