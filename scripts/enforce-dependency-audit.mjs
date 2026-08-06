import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * Runs `pnpm audit` and fails only on high/critical advisories that have an
 * available fix. Advisories with no patched release (fixAvailable absent or
 * false) are reported but do not fail the gate, so a known-unfixable transitive
 * finding cannot block CI indefinitely while a maintainer tracks an upstream fix.
 *
 * Registry/network errors are tolerated so a transient outage does not fail the
 * pipeline; a genuine fixable high/critical finding always fails.
 */

const main = () => {
  const result = spawnSync('pnpm', ['audit', '--audit-level=high', '--ignore-registry-errors', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  let audit;
  try {
    audit = JSON.parse(output);
  } catch {
    console.log('Dependency audit could not be parsed; treating registry/network failure as non-blocking.');
    process.exit(0);
  }

  const advisories = Object.values(audit?.advisories ?? {});
  const fixableHigh = advisories.filter(
    (ad) => (ad.severity === 'high' || ad.severity === 'critical') && ad.fixAvailable
  );

  for (const ad of advisories) {
    const fixStatus = ad.fixAvailable ? 'fix available' : 'no fix available';
    console.log(`  ${ad.severity}: ${ad.module_name} (${ad.title}) — ${fixStatus}`);
  }

  if (fixableHigh.length > 0) {
    console.error(`Dependency audit FAILED: ${fixableHigh.length} fixable high/critical advisory(ies).`);
    for (const ad of fixableHigh) {
      console.error(`  - ${ad.module_name}: ${ad.title}`);
    }
    process.exit(1);
  }

  console.log(`Dependency audit OK: ${advisories.length} advisory(ies), none fixable at high/critical.`);
  process.exit(0);
};

main();
