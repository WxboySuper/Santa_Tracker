import { listChangedFilesBetweenRefs } from './lib/git-changed-files.mjs';
import { CONTENT_MANAGED_LABELS, computePrLabels } from './lib/pr-labels.mjs';
import { evaluatePrChangelog } from './lib/pr-changelog-evaluate.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const prBody = process.env.PR_BODY ?? '';

if (!baseRef || !headRef) {
  console.log('No PR base/head branch; skipping label computation.');
  process.exit(0);
}

const changedFiles = listChangedFilesBetweenRefs(baseRef, headRef);

const changelog = evaluatePrChangelog({
  baseRef,
  headRef,
  changedFiles,
  body: prBody,
  repository: process.env.GITHUB_REPOSITORY ?? '',
  prNumber: Number(process.env.PR_NUMBER ?? 0),
  ghToken: process.env.GH_TOKEN ?? '',
});

const labels = computePrLabels({
  head: headRef,
  base: baseRef,
  changedFiles,
  mergeable: null,
  draft: false,
  changelog: { ok: changelog.ok, skipped: changelog.skipped },
});

console.log(JSON.stringify({ labels, contentManaged: CONTENT_MANAGED_LABELS }));
