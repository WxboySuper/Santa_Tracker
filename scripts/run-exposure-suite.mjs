#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CLIENT_EXPOSURE_TESTS = [
  'src/testing/featureExposure/exemplar.exposure.test.tsx',
  'src/testing/featureExposure/targetMatrix.test.ts',
  'src/config/v17WorkstreamAdoption.exposure.test.ts',
  'src/routing/buildFeatureGatedRoutes.test.tsx',
  'src/config/featureNavigation.test.ts',
  'src/features/FeatureBoundary.test.tsx',
  'src/features/ServerBackedFeatureBoundary.test.tsx',
  'src/config/serverCapabilityStatus.test.tsx',
];

/** Runs a command and exits the process when it fails. */
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const discoveredFeatureTests = globSync('src/features/**/*.exposure.test.{ts,tsx}', {
  cwd: ROOT,
});
const clientTests = [...new Set([...CLIENT_EXPOSURE_TESTS, ...discoveredFeatureTests])];

run('pnpm', ['exec', 'jest', '--runTestsByPath', ...clientTests]);
run('npm', ['ci', '--prefix', 'server']);

const serverExposureTests = globSync('server/testing/**/*.exposure.test.js', { cwd: ROOT });
const serverTests = [
  ...new Set([
    ...serverExposureTests,
    'server/testing/featureExposureHarness.test.js',
    'server/lib/capabilityStatus.test.js',
    'server/lib/featureCapabilities.test.js',
  ]),
];

run('node', ['--test', ...serverTests]);
