import { readFileSync, writeFileSync } from 'node:fs';
import { deriveStableVersion } from './lib/package-version.mjs';

const targetVersion = process.argv[2] ?? '';
if (!/^\d+\.\d+\.0$/.test(targetVersion)) {
  console.error('Usage: node scripts/prepare-stable-promotion.mjs <major.minor.0>');
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const sourceStableVersion = deriveStableVersion(packageJson.version);
if (sourceStableVersion !== targetVersion) {
  console.error(`Promotion target ${targetVersion} must match the source main version ${packageJson.version}.`);
  process.exit(1);
}

packageJson.version = targetVersion;
writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);

const manifest = {
  releaseId: `v${targetVersion}`,
  version: targetVersion,
  action: 'live',
  status: 'live',
  strategy: 'instant',
};
writeFileSync('deploy/production-release.json', `${JSON.stringify(manifest, null, 2)}\n`);

const changelogPath = 'CHANGELOG.md';
const changelog = readFileSync(changelogPath, 'utf8');
const laneHeading = '### Next major / beta';
const laneStart = changelog.indexOf(laneHeading);
if (laneStart === -1) {
  console.error(`CHANGELOG.md must include ${laneHeading}.`);
  process.exit(1);
}
const rest = changelog.slice(laneStart + laneHeading.length);
const nextLane = rest.search(/\n### (?!#)|\n## /);
const laneEnd = nextLane === -1 ? changelog.length : laneStart + laneHeading.length + nextLane;
const laneBody = changelog.slice(laneStart + laneHeading.length, laneEnd).trim();
if (!laneBody || /No unreleased next-major changes/i.test(laneBody)) {
  console.error('The next-major changelog lane is empty; promotion requires release notes.');
  process.exit(1);
}

const releaseSection = `## v${targetVersion}\n\n${laneBody}\n\n`;
const nextLaneReset = `${laneHeading}\n\n#### Added\n\n<!-- Continue next-major work here after this stable line is cut. -->\n`;
const nextChangelog = `${changelog.slice(0, laneStart)}${releaseSection}${nextLaneReset}${changelog.slice(laneEnd).replace(/^\s*/, '')}`;
writeFileSync(changelogPath, nextChangelog);

console.log(`Prepared stable promotion ${targetVersion}: package, production manifest, and changelog.`);
