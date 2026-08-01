import { listChangedFilesBetweenRefs } from './lib/git-changed-files.mjs';
import { evaluateChangelogPolicy } from './lib/changelog-policy.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const prBody = process.env.PR_BODY ?? '';

if (!baseRef || !headRef) {
  console.log('No PR base/head branch; skipping changelog check.');
  process.exit(0);
}

const changedFiles = listChangedFilesBetweenRefs(baseRef, headRef);
const result = evaluateChangelogPolicy({ baseRef, changedFiles, body: prBody });

if (!result.ok) {
  console.error(result.reason);
  process.exit(1);
}

console.log(result.reason);
