import { evaluatePrChangelog } from './lib/pr-changelog-evaluate.mjs';
import { listChangedFilesBetweenRefs } from './lib/git-changed-files.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const eventBody = process.env.PR_BODY ?? '';

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
