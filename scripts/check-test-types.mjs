import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'scripts', 'test-type-errors-baseline.json');
const tscPath = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');

/** Reduces diagnostics to stable per-file error-code counts so line movement does not churn the baseline. */
function collectDiagnostics(output) {
  const diagnostics = {};
  const filePattern = /^(.*?)\(\d+,\d+\): error (TS\d+):/gm;
  for (const match of output.matchAll(filePattern)) {
    const file = path.relative(root, path.resolve(root, match[1])).replaceAll('\\', '/');
    const key = `${file}:${match[2]}`;
    diagnostics[key] = (diagnostics[key] ?? 0) + 1;
  }
  const compilerPattern = /^error (TS\d+):/gm;
  for (const match of output.matchAll(compilerPattern)) {
    const key = `__compiler:${match[1]}`;
    diagnostics[key] = (diagnostics[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(diagnostics).sort(([left], [right]) => left.localeCompare(right)));
}

const result = spawnSync(process.execPath, [tscPath, '--noEmit', '-p', 'tsconfig.test.json', '--pretty', 'false'], {
  cwd: root,
  encoding: 'utf8',
});
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const current = collectDiagnostics(output);
if ((result.error || result.status === null || (result.status !== 0 && Object.keys(current).length === 0))) {
  console.error(output || result.error?.message || 'Test TypeScript check failed without diagnostics.');
  process.exit(1);
}

if (process.argv.includes('--write-baseline')) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Wrote ${Object.values(current).reduce((sum, count) => sum + count, 0)} known test type errors to the baseline.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const regressions = Object.entries(current).filter(([key, count]) => count > (baseline[key] ?? 0));
if (regressions.length > 0) {
  console.error('New test TypeScript diagnostics were introduced:');
  for (const [key, count] of regressions) {
    console.error(`  ${key}: ${count} (baseline ${baseline[key] ?? 0})`);
  }
  process.exit(1);
}

const currentCount = Object.values(current).reduce((sum, count) => sum + count, 0);
const baselineCount = Object.values(baseline).reduce((sum, count) => sum + count, 0);
console.log(`Test TypeScript regression check passed: ${currentCount}/${baselineCount} known diagnostics remain; no new diagnostics.`);
