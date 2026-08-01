import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { listDependencyBumpsBetweenRefs, applyDependencyBumpsToChangelog } from './lib/dependabot-changelog.mjs';
import { parsePortBranch } from './lib/port-pr-policy.mjs';
import { upsertManagedChangelogDeclaration } from './lib/changelog-automation.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const repository = process.env.GITHUB_REPOSITORY ?? '';
const prNumber = Number(process.env.PR_NUMBER ?? 0);
const authorLogin = process.env.PR_AUTHOR_LOGIN ?? '';
const body = process.env.PR_BODY ?? '';
const changelogPath = 'CHANGELOG.md';
const isDependabot = authorLogin === 'dependabot[bot]' && headRef.startsWith('dependabot/');
const port = parsePortBranch(headRef);

if (!baseRef || !headRef || !repository || !prNumber) {
  console.error('GITHUB_BASE_REF, GITHUB_HEAD_REF, GITHUB_REPOSITORY, and PR_NUMBER are required.');
  process.exit(1);
}

if (!isDependabot && !port) {
  console.log('No automated changelog preparation required for this PR.');
  process.exit(0);
}

const stableLine = /^stable\/\d+\.\d+\.x$/.test(baseRef);
let declaration = null;
let nextChangelog = null;

if (isDependabot) {
  const bumps = listDependencyBumpsBetweenRefs(baseRef, headRef);
  if (bumps.length === 0) {
    declaration = {
      impact: 'none',
      reason: 'Automated dependency update changes CI or development tooling without product-facing behavior changes.',
    };
  } else {
    declaration = { impact: stableLine ? 'hotfix' : 'beta' };
    execFileSync('git', ['checkout', '--detach', `origin/${headRef}`], { stdio: 'inherit' });
    const changelog = readFileSync(changelogPath, 'utf8');
    const lane = stableLine ? 'stable-hotfix' : 'next-major';
    nextChangelog = applyDependencyBumpsToChangelog(changelog, bumps, lane);
  }
} else {
  declaration = {
    impact: 'inherited',
    sourcePr: port.sourcePrNumber,
  };
}

const nextBody = upsertManagedChangelogDeclaration(body, declaration);

if (nextBody !== body) {
  execFileSync(
    'gh',
    ['api', `repos/${repository}/pulls/${prNumber}`, '--method', 'PATCH', '--input', '-'],
    { input: JSON.stringify({ body: nextBody }), stdio: ['pipe', 'inherit', 'inherit'] },
  );
  console.log(`Updated PR #${prNumber} changelog declaration before validation.`);
}

if (nextChangelog !== null) {
  const currentHeadChangelog = readFileSync(changelogPath, 'utf8');
  if (nextChangelog === currentHeadChangelog) {
    console.log(`${changelogPath} already documents this dependency update.`);
    process.exit(0);
  }
  writeFileSync(changelogPath, nextChangelog);
  execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);
  execFileSync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
  execFileSync('git', ['add', changelogPath]);
  execFileSync('git', ['commit', '-m', 'chore: document automated dependency update'], { stdio: 'inherit' });
  execFileSync('git', ['push', 'origin', `HEAD:refs/heads/${headRef}`], { stdio: 'inherit' });
  console.log(`Updated ${changelogPath} on ${headRef}.`);
}
