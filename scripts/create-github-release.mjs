import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extractReleaseNotes } from './lib/changelog.mjs';
import { hasBetaPrerelease } from './lib/package-version.mjs';
import {
  composeReleaseNotes,
  generateGitHubReleaseNotes,
  listGitHubReleases,
  selectPreviousReleaseTag,
} from './lib/release-notes.mjs';

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-beta\.\d+)?$/;
const BRANCH_PATTERN = /^[\w./-]+$/;

const version = process.argv[2];
const targetBranch = process.argv[3] ?? 'main';

if (!version || !VERSION_PATTERN.test(version)) {
  console.error('Usage: node scripts/create-github-release.mjs <semver-version> [target-branch]');
  process.exit(1);
}

if (!BRANCH_PATTERN.test(targetBranch)) {
  console.error(`Invalid target branch: ${targetBranch}`);
  process.exit(1);
}

const changelogPath = process.env.CHANGELOG_FILE ?? 'CHANGELOG.md';
const changelog = readFileSync(changelogPath, 'utf8');
const curatedNotes =
  extractReleaseNotes(changelog, version, process.env.CHANGELOG_LANE ?? '') ??
  `## v${version}\n\nRelease for package version ${version}.`;

const mode = process.env.RELEASE_NOTES_MODE ?? 'changelog';
if (!['changelog', 'prs', 'changelog-and-prs'].includes(mode)) {
  console.error(`Invalid RELEASE_NOTES_MODE: ${mode}`);
  process.exit(1);
}

const repository = process.env.GITHUB_REPOSITORY ?? execFileSync(
  'gh',
  ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
  { encoding: 'utf8' },
).trim();
const tag = `v${version}`;
const previousTag = process.env.PREVIOUS_TAG?.trim() || selectPreviousReleaseTag({
  version,
  releases: listGitHubReleases(repository),
});
let generatedNotes = '';

if (mode !== 'changelog') {
  try {
    generatedNotes = generateGitHubReleaseNotes({
      repository,
      tag,
      targetBranch,
      previousTag,
      configurationPath: '.github/release.yml',
    });
    console.log(`Generated GitHub PR notes from ${previousTag ?? 'repository history'}.`);
  } catch (error) {
    if (mode === 'prs') throw error;
    console.warn(`GitHub PR note generation failed; continuing with curated notes: ${error.message}`);
  }
}

const changelogUrl = `https://github.com/${repository}/blob/${targetBranch}/${changelogPath}`;
const section = composeReleaseNotes({ mode, curatedNotes, generatedNotes, changelogUrl });

const notesFile = process.env.NOTES_FILE ?? 'release-notes.md';
writeFileSync(notesFile, `${section}\n`);

const prerelease = hasBetaPrerelease(version);

const ghReleaseExists = () => {
  try {
    execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const createGhRelease = () => {
  const args = [
    'release',
    'create',
    tag,
    '--title',
    tag,
    '--notes-file',
    notesFile,
    '--target',
    targetBranch,
  ];
  if (prerelease) args.push('--prerelease');
  execFileSync('gh', args, { stdio: 'inherit' });
};

if (ghReleaseExists()) {
  console.log(`GitHub release ${tag} already exists.`);
} else {
  createGhRelease();
  console.log(`Created GitHub release ${tag}${prerelease ? ' (prerelease)' : ''}.`);
}
