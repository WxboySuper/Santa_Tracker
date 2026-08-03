import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { evaluateChangelogPolicy } from './lib/changelog-policy.mjs';
import { listChangedFilesBetweenRefs } from './lib/git-changed-files.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const eventBody = process.env.PR_BODY ?? '';

/** Fetch the current PR body so automated changelog edits are validated immediately. */
const livePrBody = () => {
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const prNumber = Number(process.env.PR_NUMBER ?? 0);
  const canReadLiveBody = [repository, prNumber, process.env.GH_TOKEN].every(Boolean);
  if (!canReadLiveBody) return eventBody;
  try {
    return execFileSync(
      'gh',
      ['api', `repos/${repository}/pulls/${prNumber}`, '--jq', '.body'],
      { encoding: 'utf8' },
    );
  } catch {
    return eventBody;
  }
};

if (!baseRef || !headRef) {
  console.log('No PR base/head branch; skipping changelog check.');
  process.exit(0);
}

const changedFiles = listChangedFilesBetweenRefs(baseRef, headRef);
const changelogPath = 'CHANGELOG.md';
/**
 * Reads the changelog from a remote branch, falling back to the checked-out file.
 * @param {string} ref
 * @returns {string}
 */
const readRefChangelog = (ref) => {
  try {
    return execFileSync('git', ['show', `origin/${ref}:${changelogPath}`], { encoding: 'utf8' });
  } catch {
    return existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '';
  }
};
const result = evaluateChangelogPolicy({
  baseRef,
  changedFiles,
  body: livePrBody(),
  changelog: readRefChangelog(headRef),
  baseChangelog: readRefChangelog(baseRef),
});

if (!result.ok) {
  console.error(result.reason);
  process.exit(1);
}

console.log(result.reason);
