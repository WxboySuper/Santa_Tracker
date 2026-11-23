#!/usr/bin/env node
import fs from 'node:fs';

const TYPES = new Set([
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
]);
const CHANGELOG_EXEMPT_TYPES = new Set(['docs', 'ci', 'chore', 'test']);

export function parseConventionalTitle(title) {
  if (typeof title !== 'string') return null;
  const match = /^(\w+)(?:\(([^()]+)\))?(!)?:\s+(.*\S)$/.exec(title.trim());
  if (!match || !TYPES.has(match[1])) return null;
  return {
    type: match[1],
    scope: match[2] ?? null,
    breaking: Boolean(match[3]),
    subject: match[4],
  };
}

export function isChangelogExempt({ parsedTitle, labels = [], author = '' }) {
  const normalizedLabels = labels.map((label) =>
    typeof label === 'string' ? label.toLowerCase() : label?.name?.toLowerCase(),
  );
  return (
    normalizedLabels.includes('no-changelog') ||
    CHANGELOG_EXEMPT_TYPES.has(parsedTitle?.type) ||
    /^dependabot(?:\[bot\])?$/i.test(author)
  );
}

function getPullRequest(event) {
  if (!event.pull_request) throw new Error('Expected a pull_request event payload.');
  return event.pull_request;
}

function titleFailures(parsedTitle) {
  if (parsedTitle) return [];
  return [
    `PR title must match Conventional Commits: type(scope): subject, with an optional ! before the colon for breaking changes. Allowed types: ${[...TYPES].join(', ')}.`,
  ];
}

async function listChangedFiles({ repository, pullNumber, token }) {
  const changedFiles = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/pulls/${pullNumber}/files?per_page=100&page=${page}`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
        },
      },
    );
    if (!response.ok)
      throw new Error(
        `GitHub API could not list PR files (${response.status} ${response.statusText})`,
      );
    const files = await response.json();
    changedFiles.push(
      ...files.map(({ filename, status, previous_filename }) => ({
        filename,
        status,
        previous_filename,
      })),
    );
    if (files.length < 100) return changedFiles;
  }
}

export function isChangelogUpdate(file) {
  if (file.filename !== 'CHANGELOG.md') return false;
  if (['added', 'modified', 'changed', 'copied'].includes(file.status)) return true;
  return file.status === 'renamed' && file.previous_filename !== 'CHANGELOG.md';
}

async function changelogFailure({ event, pr, parsedTitle, author, token }) {
  if (isChangelogExempt({ parsedTitle, labels: pr.labels ?? [], author })) return null;
  if (!event.repository?.full_name)
    return 'Cannot check CHANGELOG.md because repository context is missing from the pull request event.';
  if (!token) return 'Cannot check CHANGELOG.md because GITHUB_TOKEN is missing.';
  const files = await listChangedFiles({
    repository: event.repository.full_name,
    pullNumber: pr.number,
    token,
  });
  if (files.some(isChangelogUpdate)) return null;
  return 'CHANGELOG.md must be updated. Add the no-changelog label for an intentional omission. Docs, ci, chore, and test titles, plus Dependabot PRs, are exempt.';
}

function getTitleFailures(pr) {
  return titleFailures(parseConventionalTitle(pr.title));
}

async function getChangelogFailures(event, pr, token) {
  const parsedTitle = parseConventionalTitle(pr.title);
  const author = pr.user?.login ?? '';
  const failure = await changelogFailure({ event, pr, parsedTitle, author, token });
  return failure ? [failure] : [];
}

export async function checkPullRequest(event, token = process.env.GITHUB_TOKEN) {
  const pr = getPullRequest(event);
  const failures = getTitleFailures(pr);
  failures.push(...(await getChangelogFailures(event, pr, token)));
  return { failures };
}

async function main() {
  const payloadPath = process.env.GITHUB_EVENT_PATH;
  if (!payloadPath) throw new Error('GITHUB_EVENT_PATH is not set.');
  const event = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const result = await checkPullRequest(event);
  if (result.failures.length) {
    for (const failure of result.failures) console.error(`::error::${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('PR title and changelog checks passed.');
}

if (process.argv[1] && process.argv[1].endsWith('pr-hygiene.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
