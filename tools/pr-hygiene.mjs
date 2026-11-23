#!/usr/bin/env node
import fs from 'node:fs';

const TYPES = new Set(['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']);
const CHANGELOG_EXEMPT_TYPES = new Set(['docs', 'ci', 'chore', 'test']);

export function parseConventionalTitle(title) {
  if (typeof title !== 'string') return null;
  const match = /^(\w+)(?:\(([^()]+)\))?:\s+(.+\S)$/.exec(title.trim());
  if (!match || !TYPES.has(match[1])) return null;
  return { type: match[1], scope: match[2] ?? null, subject: match[3] };
}

export function isChangelogExempt({ parsedTitle, labels = [], author = '' }) {
  const normalizedLabels = labels.map((label) => typeof label === 'string' ? label.toLowerCase() : label.name?.toLowerCase());
  return normalizedLabels.includes('no-changelog')
    || CHANGELOG_EXEMPT_TYPES.has(parsedTitle?.type)
    || /^dependabot(?:\[bot\])?$/i.test(author);
}

async function listChangedFiles({ repository, pullNumber, token }) {
  const names = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(`https://api.github.com/repos/${repository}/pulls/${pullNumber}/files?per_page=100&page=${page}`, {
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
    });
    if (!response.ok) throw new Error(`GitHub API could not list PR files (${response.status} ${response.statusText})`);
    const files = await response.json();
    names.push(...files.map(({ filename }) => filename));
    if (files.length < 100) return names;
  }
}

export async function checkPullRequest(event, token = process.env.GITHUB_TOKEN) {
  const pr = event.pull_request;
  if (!pr) throw new Error('Expected a pull_request event payload.');
  const parsedTitle = parseConventionalTitle(pr.title);
  const author = pr.user?.login ?? '';
  if (/^dependabot(?:\[bot\])?$/i.test(author)) return { ignored: true, failures: [] };
  const failures = [];
  if (!parsedTitle) {
    failures.push(`PR title "${pr.title}" must match Conventional Commits: type(scope): subject. Allowed types: ${[...TYPES].join(', ')}.`);
  }
  const exempt = isChangelogExempt({ parsedTitle, labels: pr.labels ?? [], author });
  if (!exempt) {
    if (!token) throw new Error('GITHUB_TOKEN is required to check changed PR files.');
    const files = await listChangedFiles({ repository: event.repository.full_name, pullNumber: pr.number, token });
    if (!files.includes('CHANGELOG.md')) {
      failures.push('CHANGELOG.md must be updated. Add the no-changelog label for an intentional omission. Docs, ci, chore, and test titles, plus Dependabot PRs, are exempt.');
    }
  }
  return { ignored: false, failures };
}

async function main() {
  const payloadPath = process.env.GITHUB_EVENT_PATH;
  if (!payloadPath) throw new Error('GITHUB_EVENT_PATH is not set.');
  const event = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const result = await checkPullRequest(event);
  if (result.ignored) {
    console.log('Ignoring Dependabot PR.');
    return;
  }
  if (result.failures.length) {
    for (const failure of result.failures) console.error(`::error::${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('PR title and changelog checks passed.');
}

if (process.argv[1] && process.argv[1].endsWith('pr-hygiene.mjs')) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
