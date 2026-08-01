import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveStableVersion } from './lib/package-version.mjs';
import {
  normalizeProductionReleaseConfig,
  validateProductionReleaseForDeploy,
} from '../server/lib/production-release.mjs';

const manifestPath = resolve('deploy/production-release.json');
const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const eventName = process.env.GITHUB_EVENT_NAME ?? '';

const isStableHotfix =
  eventName === 'pull_request' && /^stable\/\d+\.\d+\.x$/.test(baseRef);

if (!isStableHotfix) {
  process.exit(0);
}

if (!existsSync(manifestPath)) {
  console.error(
    'Stable hotfix PRs must include deploy/production-release.json with the release metadata.',
  );
  process.exit(1);
}

const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const expectedVersion = deriveStableVersion(packageVersion) ?? packageVersion;
const config = normalizeProductionReleaseConfig(JSON.parse(readFileSync(manifestPath, 'utf8')));

const result = validateProductionReleaseForDeploy({
  config,
  packageVersion: expectedVersion,
  deployAction: config.action,
  nowMs: Date.now(),
});

if (!result.ok) {
  console.error('deploy/production-release.json is invalid for promotion:');
  for (const message of result.errors) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

console.log(`Stable hotfix manifest ok (releaseId=${config.releaseId}, action=${config.action}).`);
