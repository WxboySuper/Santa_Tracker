import { listChangedFilesBetweenRefs } from './lib/git-changed-files.mjs';
import { CONTENT_MANAGED_LABELS, computePrLabels } from './lib/pr-labels.mjs';
import { evaluateChangelogPolicy } from './lib/changelog-policy.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const prBody = process.env.PR_BODY ?? '';

if (!baseRef || !headRef) {
  console.log('No PR base/head branch; skipping label computation.');
  process.exit(0);
}

const changedFiles = listChangedFilesBetweenRefs(baseRef, headRef);

const changelogOk = evaluateChangelogPolicy({
  baseRef,
  changedFiles,
  body: prBody,
}).ok;

const labels = computePrLabels({
  head: headRef,
  base: baseRef,
  changedFiles,
  mergeable: null,
  draft: false,
  changelogOk,
});

console.log(JSON.stringify({ labels, contentManaged: CONTENT_MANAGED_LABELS }));
