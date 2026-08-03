import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAllPages, GITHUB_PAGE_SIZE } from './github-paginate.mjs';
import {
  findExistingReportIssue,
  isStaleBranch,
  isTrackedBranch,
  REPORT_ISSUE_LABELS,
  REPORT_ISSUE_MARKER,
  REPORT_ISSUE_TITLE,
  toBranchRow,
} from './stale-branch-report.mjs';

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/stale-branch-report.json'
);

/**
 * @param {string} repository
 * @param {string} token
 * @param {string} path
 * @param {{ method?: string, body?: unknown, allowStatuses?: number[] }} [options]
 */
export async function githubRequest(repository, token, path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    if (options.allowStatuses?.includes(response.status)) {
      return null;
    }
    const text = await response.text();
    throw new Error(`GitHub API ${response.status} for ${path}: ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

/**
 * @param {string} repository
 * @param {string} token
 */
async function listBranches(repository, token) {
  return fetchAllPages((page) =>
    githubRequest(repository, token, `/branches?per_page=${GITHUB_PAGE_SIZE}&page=${page}`)
  );
}

/**
 * @param {string} repository
 * @param {string} token
 */
async function listOpenPulls(repository, token) {
  return fetchAllPages((page) =>
    githubRequest(repository, token, `/pulls?state=open&per_page=${GITHUB_PAGE_SIZE}&page=${page}`)
  );
}

/**
 * @param {string} repository
 * @param {string} token
 * @param {string} ref
 */
async function fetchCommit(repository, token, ref) {
  return githubRequest(repository, token, `/commits/${encodeURIComponent(ref)}`);
}

/**
 * @param {string} repository
 * @param {string} token
 * @param {string} baseBranch
 * @param {string} headBranch
 */
async function fetchBehindBy(repository, token, baseBranch, headBranch) {
  const compare = await githubRequest(
    repository,
    token,
    `/compare/${encodeURIComponent(`${baseBranch}...${headBranch}`)}`,
    { allowStatuses: [404] }
  );
  return compare?.behind_by ?? null;
}

/**
 * @param {string} repository
 * @param {string} token
 */
async function listOpenIssues(repository, token) {
  return fetchAllPages((page) =>
    githubRequest(repository, token, `/issues?state=open&per_page=${GITHUB_PAGE_SIZE}&page=${page}`)
  );
}

/**
 * @param {string} repository
 * @param {string} token
 * @param {string} name
 */
async function ensureLabel(repository, token, name) {
  try {
    await githubRequest(repository, token, `/labels/${encodeURIComponent(name)}`);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('GitHub API 404')) {
      throw error;
    }
    await githubRequest(repository, token, '/labels', {
      method: 'POST',
      body: {
        name,
        color: 'ededed',
        description: 'Repository automation and hygiene',
      },
    });
  }
}

/** @returns {Promise<{ branches: any[], openPulls: any[], baseBranch: string, now: Date, errors: string[] }>} */
export async function loadFixtureInputs() {
  const raw = await readFile(FIXTURE_PATH, 'utf8');
  const fixture = JSON.parse(raw);
  return {
    branches: fixture.branches,
    openPulls: fixture.openPulls,
    baseBranch: fixture.baseBranch ?? 'beta',
    now: new Date(fixture.now),
    errors: fixture.errors ?? [],
  };
}

/**
 * @param {{
 *   repository: string,
 *   token: string,
 *   baseBranch?: string,
 * }} context
 */
export async function fetchStaleBranchInputs({ repository, token, baseBranch = 'beta' }) {
  const errors = [];
  const now = new Date();
  const [branchSummaries, openPulls] = await Promise.all([
    listBranches(repository, token),
    listOpenPulls(repository, token),
  ]);

  const openPrByBranch = new Map(openPulls.map((pull) => [pull.head.ref, pull.number]));
  const trackedSummaries = branchSummaries.filter((summary) => isTrackedBranch(summary.name));
  const branches = [];

  for (const summary of trackedSummaries) {
    try {
      const commit = await fetchCommit(repository, token, summary.name);
      const row = toBranchRow(
        { name: summary.name, commit, behindBy: null },
        openPrByBranch,
        now
      );
      let behindBy = null;

      if (isStaleBranch(row.ageDays)) {
        try {
          behindBy = await fetchBehindBy(repository, token, baseBranch, summary.name);
        } catch (error) {
          errors.push(
            `compare ${baseBranch}...${summary.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      branches.push({
        name: summary.name,
        commit,
        behindBy,
      });
    } catch (error) {
      errors.push(
        `commit ${summary.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    branches,
    openPulls,
    baseBranch,
    now,
    errors,
  };
}

/**
 * @param {{
 *   repository: string,
 *   token: string,
 *   body: string,
 * }} context
 */
export async function upsertStaleBranchReportIssue({ repository, token, body }) {
  for (const label of REPORT_ISSUE_LABELS) {
    await ensureLabel(repository, token, label);
  }

  const issues = await listOpenIssues(repository, token);
  const existing = findExistingReportIssue(
    issues.filter((issue) => !issue.pull_request)
  );

  if (existing) {
    await githubRequest(repository, token, `/issues/${existing.number}`, {
      method: 'PATCH',
      body: { body, title: REPORT_ISSUE_TITLE },
    });
    return { action: 'updated', issueNumber: existing.number };
  }

  const created = await githubRequest(repository, token, '/issues', {
    method: 'POST',
    body: {
      title: REPORT_ISSUE_TITLE,
      body,
      labels: REPORT_ISSUE_LABELS,
    },
  });

  return { action: 'created', issueNumber: created.number };
}
