import { readFileSync, writeFileSync } from 'node:fs';
import {
  applyDependencyBumpsToChangelog,
  listDependencyBumpsBetweenRefs,
} from './lib/dependabot-changelog.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const changelogPath = process.env.CHANGELOG_FILE ?? 'CHANGELOG.md';
const changelogLane = /^stable\/\d+\.\d+\.x$/.test(baseRef) ? 'stable-hotfix' : 'next-major';

if (!baseRef || !headRef) {
  console.error('Set GITHUB_BASE_REF and GITHUB_HEAD_REF.');
  process.exit(1);
}

if (!headRef.startsWith('dependabot/')) {
  console.log('Not a Dependabot branch; skipping changelog update.');
  process.exit(0);
}

const bumps = listDependencyBumpsBetweenRefs(baseRef, headRef);
if (bumps.length === 0) {
  console.log('No dependency version changes detected in package.json files.');
  process.exit(0);
}

const changelog = readFileSync(changelogPath, 'utf8');
const next = applyDependencyBumpsToChangelog(changelog, bumps, changelogLane);

if (next === changelog) {
  console.log(`${changelogPath} already up to date for dependency bumps.`);
  process.exit(0);
}

writeFileSync(changelogPath, next);
console.log(`Updated ${changelogPath} for: ${bumps.map((b) => b.name).join(', ')}`);
