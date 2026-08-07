import { fetchAllPages, GITHUB_PAGE_SIZE } from './lib/github-paginate.mjs';
import { ciLabelFromCheckRuns, diffCiLabels, parsePrNumbers } from './lib/pr-ci-label-state.mjs';

const token = process.env.GITHUB_TOKEN ?? '';
const repository = process.env.GITHUB_REPOSITORY ?? '';
const prNumbers = parsePrNumbers(process.env.PR_NUMBERS ?? process.env.PR_NUMBER ?? '');

if (!token || !repository || prNumbers.length === 0) {
  console.error('GITHUB_TOKEN, GITHUB_REPOSITORY, and PR_NUMBER (or a comma-separated PR_NUMBERS) are required.');
  process.exit(1);
}

const [owner, repo] = repository.split('/');

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function githubApi(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

/** Syncs the ci:pending/ci:passing/ci:failing label for one PR. */
async function syncPrCiLabel(prNumber) {
  const pull = await githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  const checkRuns = await fetchAllPages(async (page) => {
    const checkData = await githubApi(
      `/repos/${owner}/${repo}/commits/${pull.head.sha}/check-runs?filter=latest&per_page=${GITHUB_PAGE_SIZE}&page=${page}`,
    );
    return checkData?.check_runs ?? [];
  });
  const existing = (
    await githubApi(`/repos/${owner}/${repo}/issues/${prNumber}/labels?per_page=100`)
  ).map((label) => label.name);

  const desired = ciLabelFromCheckRuns(
    checkRuns.map((run) => ({
      status: run.status,
      conclusion: run.conclusion,
    })),
  );

  const { add, remove } = diffCiLabels(existing, desired);

  for (const name of remove) {
    try {
      await githubApi(`/repos/${owner}/${repo}/issues/${prNumber}/labels/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('404 ')) throw err;
    }
  }

  if (add.length > 0) {
    await githubApi(`/repos/${owner}/${repo}/issues/${prNumber}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels: add }),
    });
  }

  console.log(
    `CI label for PR #${prNumber}: ${desired} (${checkRuns.length} check runs; add=${add.join(',') || 'none'} remove=${remove.join(',') || 'none'})`,
  );
}

for (const prNumber of prNumbers) {
  await syncPrCiLabel(prNumber);
}
