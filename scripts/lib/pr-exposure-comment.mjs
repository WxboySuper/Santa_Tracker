import { fetchAllPages, GITHUB_PAGE_SIZE } from './github-paginate.mjs';
import { formatFeatureList } from './feature-exposure-report.mjs';

export const PROMOTION_EXPOSURE_COMMENT_MARKER = '<!-- gfc-promotion-exposure-report -->';

/**
 * @param {{ id: number, body?: string }[]} comments
 */
export function findExistingExposureComment(comments) {
  return comments.find((comment) => comment.body?.includes(PROMOTION_EXPOSURE_COMMENT_MARKER)) ?? null;
}

/**
 * @param {boolean} ok
 */
function statusEmoji(ok) {
  return ok ? '✅' : '❌';
}

/**
 * @param {string} value
 */
export function escapeMarkdownTableCell(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * @param {{ name: string, ok: boolean, details: string }[]} checkRows
 */
function formatCheckTable(checkRows) {
  const lines = [
    '| Check | Status | Details |',
    '|---|---|---|',
    ...checkRows.map(
      (row) => `| ${row.name} | ${statusEmoji(row.ok)} | ${escapeMarkdownTableCell(row.details)} |`
    ),
  ];
  return lines.join('\n');
}

/**
 * @param {{
 *   checkRows: { name: string, ok: boolean, details: string }[],
 *   report: { sections: Record<string, { featureKey: string }[]> },
 *   newlyProductionVisible: { featureKey: string }[],
 *   runUrl?: string,
 * }} context
 */
export function formatPromotionExposureComment({ checkRows, report, newlyProductionVisible, runUrl }) {
  const exposureLines = [
    '| Exposure | Features |',
    '|---|---|',
    `| Production-enabled | ${formatFeatureList(report.sections.production)} |`,
    `| Beta-only | ${formatFeatureList(report.sections.betaOnly)} |`,
    `| Disabled | ${formatFeatureList([...report.sections.disabled, ...report.sections.localOnly])} |`,
    `| Newly production-visible (vs main) | ${formatFeatureList(newlyProductionVisible)} |`,
  ];

  const runLink = runUrl ? `[CI run](${runUrl})` : 'CI';

  return [
    PROMOTION_EXPOSURE_COMMENT_MARKER,
    '## Production exposure report',
    '',
    formatCheckTable(checkRows),
    '',
    ...exposureLines,
    '',
    `<sub>Updated by ${runLink} · Re-run locally: \`pnpm exposure:report\`</sub>`,
  ].join('\n');
}

/**
 * @param {string} repository
 * @param {string} token
 * @param {number} prNumber
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [options]
 */
async function githubRequest(repository, token, path, options = {}) {
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
    const text = await response.text();
    throw new Error(`GitHub API ${response.status} for ${path}: ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

/**
 * @param {string} repository
 * @param {string} token
 * @param {number} prNumber
 */
async function listIssueComments(repository, token, prNumber) {
  return fetchAllPages((page) =>
    githubRequest(
      repository,
      token,
      `/issues/${prNumber}/comments?per_page=${GITHUB_PAGE_SIZE}&page=${page}`
    )
  );
}

/**
 * @param {{
 *   repository: string,
 *   token: string,
 *   prNumber: number,
 *   body: string,
 * }} context
 */
export async function upsertPromotionExposureComment({ repository, token, prNumber, body }) {
  const comments = await listIssueComments(repository, token, prNumber);
  const existing = findExistingExposureComment(comments);

  if (existing) {
    await githubRequest(repository, token, `/issues/comments/${existing.id}`, {
      method: 'PATCH',
      body: { body },
    });
    return { action: 'updated', commentId: existing.id };
  }

  const created = await githubRequest(repository, token, `/issues/${prNumber}/comments`, {
    method: 'POST',
    body: { body },
  });
  return { action: 'created', commentId: created.id };
}
