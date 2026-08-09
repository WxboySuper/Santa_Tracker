import { execFileSync } from 'node:child_process';
import { evaluatePrChangelog } from './lib/pr-changelog-evaluate.mjs';
import { listChangedFilesBetweenRefs } from './lib/git-changed-files.mjs';

const eventBaseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const eventBody = process.env.PR_BODY ?? '';

/** Fetch the current PR base so stacked PRs use their live parent branch. */
const livePrBaseRef = () => {
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const prNumber = Number(process.env.PR_NUMBER ?? 0);
  if (![repository, prNumber, process.env.GH_TOKEN].every(Boolean)) return '';
  try {
    return execFileSync('gh', [
      'api',
      `repos/${repository}/pulls/${prNumber}`,
      '--jq',
      '.base.ref',
    ], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

// GitHub merge refs for stacked PRs can report the default branch as the event base;
// the live PR base is authoritative for the diff this check is meant to govern.
const baseRef = livePrBaseRef() || eventBaseRef;

if (!baseRef || !headRef) {
  console.log('No PR base/head branch; skipping changelog check.');
  process.exit(0);
}

const changedFiles = listChangedFilesBetweenRefs(baseRef, headRef);

const result = evaluatePrChangelog({
  baseRef,
  headRef,
  changedFiles,
  body: eventBody,
  repository: process.env.GITHUB_REPOSITORY ?? '',
  prNumber: Number(process.env.PR_NUMBER ?? 0),
  ghToken: process.env.GH_TOKEN ?? '',
});

if (!result.ok) {
  console.error(result.reason);
  process.exit(1);
}

console.log(result.reason);
