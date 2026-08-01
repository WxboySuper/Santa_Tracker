import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  normalizeProductionReleaseConfig,
  validateProductionReleaseForDeploy,
} from '../server/lib/production-release.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';

if (!/^stable\/\d+\.\d+\.x$/.test(baseRef)) {
  console.log('Not a stable-line PR; skipping stable hotfix policy.');
  process.exit(0);
}

/** @param {string} ref @param {string} path @returns {Record<string, unknown>} */
const readJsonAtRef = (ref, path) => JSON.parse(
  execFileSync('git', ['show', `origin/${ref}:${path}`], { encoding: 'utf8' }),
);
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const basePackage = readJsonAtRef(baseRef, 'package.json');
const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/;
const current = String(packageJson.version).match(versionPattern);
const previous = String(basePackage.version).match(versionPattern);

if (!current || !previous) {
  console.error('Stable hotfixes require stable semver in package.json; got ' + packageJson.version + '.');
  process.exit(1);
}

const sameStableLine = current[1] === previous[1] && current[2] === previous[2];
const advancesPatch = Number(current[3]) > Number(previous[3]);
if (!sameStableLine || !advancesPatch) {
  console.error(
    'Stable hotfix PRs must advance the patch version from ' + basePackage.version +
      ' to a newer ' + current[1] + '.' + current[2] + '.Y version.',
  );
  process.exit(1);
}

const changedFiles = execFileSync('git', ['diff', '--name-only', `origin/${baseRef}...HEAD'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

for (const required of ['package.json', 'deploy/production-release.json', 'CHANGELOG.md']) {
  if (!changedFiles.includes(required)) {
    console.error('Stable hotfix PRs must update ' + required + '.');
    process.exit(1);
  }
}

const manifest = normalizeProductionReleaseConfig(
  JSON.parse(readFileSync('deploy/production-release.json', 'utf8')),
);
if (manifest.releaseId !== 'v' + packageJson.version) {
  console.error(
    'deploy/production-release.json releaseId must be v' + packageJson.version +
      ', got ' + manifest.releaseId + '.',
  );
  process.exit(1);
}

const validation = validateProductionReleaseForDeploy({
  config: manifest,
  packageVersion: packageJson.version,
  deployAction: manifest.action,
});
if (!validation.ok) {
  console.error('Stable hotfix release manifest is invalid:');
  for (const error of validation.errors) console.error('  - ' + error);
  process.exit(1);
}

console.log(
  'Stable hotfix policy OK: ' + (headRef || 'head') + ' advances ' +
    basePackage.version + ' -> ' + packageJson.version + '.',
);
