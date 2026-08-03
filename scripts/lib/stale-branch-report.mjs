/** @typedef {{
 *   name: string,
 *   sha: string,
 *   committedAt: string,
 *   authorLogin: string | null,
 *   authorName: string,
 *   ageDays: number,
 *   behindBy: number | null,
 *   openPrNumber: number | null,
 * }} StaleBranchRow */

export const STALE_BRANCH_PREFIXES = ['feature/', 'fix/', 'research/'];
export const PROTECTED_BRANCHES = new Set(['main', 'beta']);
export const EXCLUDED_PREFIXES = ['port/', 'dependabot/', 'release/', 'hotfix/'];
export const EXCLUDED_BRANCH_PATTERNS = [/^feature\/release-/];
export const GRACE_PERIOD_DAYS = 14;
export const REPORT_ISSUE_MARKER = '<!-- gfc-stale-branch-report -->';
export const REPORT_ISSUE_TITLE = '[Maintainer] Stale branch report';
export const REPORT_ISSUE_LABELS = ['repository-hygiene', 'automation'];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {string} branchName
 */
export function isTrackedBranch(branchName) {
  if (PROTECTED_BRANCHES.has(branchName)) {
    return false;
  }
  if (EXCLUDED_PREFIXES.some((prefix) => branchName.startsWith(prefix))) {
    return false;
  }
  if (EXCLUDED_BRANCH_PATTERNS.some((pattern) => pattern.test(branchName))) {
    return false;
  }
  return STALE_BRANCH_PREFIXES.some((prefix) => branchName.startsWith(prefix));
}

/**
 * @param {string} isoDate
 * @param {Date} now
 */
export function ageInDays(isoDate, now) {
  const committedAt = new Date(isoDate);
  if (Number.isNaN(committedAt.getTime())) {
    return 0;
  }
  return Math.floor((now.getTime() - committedAt.getTime()) / MS_PER_DAY);
}

/**
 * @param {number} ageDays
 */
export function isStaleBranch(ageDays) {
  return ageDays > GRACE_PERIOD_DAYS;
}

/**
 * @param {string} value
 */
export function escapeMarkdownTableCell(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * @param {number | null} behindBy
 */
export function formatBehindBeta(behindBy) {
  if (behindBy === null || behindBy === undefined) {
    return 'unknown';
  }
  return String(behindBy);
}

/**
 * @param {string | null} authorLogin
 * @param {string} authorName
 */
export function formatAuthor(authorLogin, authorName) {
  if (authorLogin) {
    return `\`${authorLogin}\``;
  }
  return authorName;
}

/**
 * @param {number | null} openPrNumber
 * @param {string} [repository]
 */
export function formatOpenPr(openPrNumber, repository) {
  if (!openPrNumber) {
    return 'orphaned';
  }
  if (repository) {
    return `[#${openPrNumber}](https://github.com/${repository}/pull/${openPrNumber})`;
  }
  return `#${openPrNumber}`;
}

/**
 * @param {{
 *   name: string,
 *   commit: {
 *     sha: string,
 *     commit?: { author?: { name?: string, date?: string }, committer?: { date?: string } },
 *     author?: { login?: string },
 *   },
 *   behindBy?: number | null,
 * }} branch
 * @param {Map<string, number>} openPrByBranch
 * @param {Date} now
 */
export function toBranchRow(branch, openPrByBranch, now) {
  const committedAt =
    branch.commit.commit?.committer?.date ??
    branch.commit.commit?.author?.date ??
    new Date(0).toISOString();
  const ageDays = ageInDays(committedAt, now);

  return {
    name: branch.name,
    sha: branch.commit.sha.slice(0, 7),
    committedAt,
    authorLogin: branch.commit.author?.login ?? null,
    authorName: branch.commit.commit?.author?.name ?? 'unknown',
    ageDays,
    behindBy: branch.behindBy ?? null,
    openPrNumber: openPrByBranch.get(branch.name) ?? null,
  };
}

/**
 * @param {StaleBranchRow[]} rows
 */
function sortRows(rows) {
  return [...rows].sort((left, right) => {
    if (right.ageDays !== left.ageDays) {
      return right.ageDays - left.ageDays;
    }
    return left.name.localeCompare(right.name);
  });
}

/**
 * @param {StaleBranchRow[]} rows
 * @param {string} [repository]
 */
function formatBranchTable(rows, repository) {
  if (!rows.length) {
    return '_None._';
  }

  const lines = [
    '| Branch | Age (days) | Last commit | Author | Open PR | Behind beta |',
    '|---|---:|---|---|---|---:|',
    ...rows.map((row) => {
      const author = formatAuthor(row.authorLogin, row.authorName);
      const lastCommit = `${row.sha} (${row.committedAt.slice(0, 10)})`;
      return `| \`${escapeMarkdownTableCell(row.name)}\` | ${row.ageDays} | ${escapeMarkdownTableCell(lastCommit)} | ${escapeMarkdownTableCell(author)} | ${formatOpenPr(row.openPrNumber, repository)} | ${formatBehindBeta(row.behindBy)} |`;
    }),
  ];

  return lines.join('\n');
}

/**
 * @param {{
 *   generatedAt: string,
 *   baseBranch: string,
 *   staleRows: StaleBranchRow[],
 *   activeWithinGraceCount: number,
 *   errors?: string[],
 *   runUrl?: string,
 *   repository?: string,
 * }} context
 */
export function formatStaleBranchReport({
  generatedAt,
  baseBranch,
  staleRows,
  activeWithinGraceCount,
  errors = [],
  runUrl,
  repository,
}) {
  const orphaned = sortRows(staleRows.filter((row) => !row.openPrNumber));
  const withOpenPr = sortRows(staleRows.filter((row) => row.openPrNumber));

  const runLink = runUrl ? `[workflow run](${runUrl})` : 'workflow';
  const lines = [
    REPORT_ISSUE_MARKER,
    '## Stale branch report',
    '',
    `Generated: ${generatedAt}`,
    `Base branch: \`${baseBranch}\``,
    `Grace period: ${GRACE_PERIOD_DAYS} days`,
    `Tracked prefixes: ${STALE_BRANCH_PREFIXES.map((prefix) => `\`${prefix}*\``).join(', ')}`,
    '',
    `Stale branches: **${staleRows.length}**`,
    `Active within grace period: **${activeWithinGraceCount}**`,
    '',
    '### Orphaned (no open PR)',
    '',
    formatBranchTable(orphaned, repository),
    '',
    '### Has open PR',
    '',
    formatBranchTable(withOpenPr, repository),
  ];

  if (errors.length > 0) {
    lines.push('', '### Errors', '', ...errors.map((error) => `- ${error}`));
  }

  lines.push(
    '',
    `<sub>Updated by ${runLink} · Re-run locally: \`pnpm branches:report\` (dry-run fixture) or trigger the Stale branch report workflow.</sub>`
  );

  return lines.join('\n');
}

/**
 * @param {{
 *   branches: { name: string, commit: StaleBranchRow['sha'] extends string ? any : never }[],
 *   openPulls: { number: number, head: { ref: string } }[],
 *   now?: Date,
 *   baseBranch?: string,
 * }} input
 */
export function buildStaleBranchReport(input) {
  const now = input.now ?? new Date();
  const openPrByBranch = new Map(
    input.openPulls.map((pull) => [pull.head.ref, pull.number])
  );

  const trackedRows = input.branches
    .filter((branch) => isTrackedBranch(branch.name))
    .map((branch) => toBranchRow(branch, openPrByBranch, now));

  const staleRows = trackedRows.filter((row) => isStaleBranch(row.ageDays));
  const activeWithinGraceCount = trackedRows.length - staleRows.length;

  return {
    generatedAt: now.toISOString(),
    baseBranch: input.baseBranch ?? 'beta',
    staleRows,
    activeWithinGraceCount,
  };
}

/**
 * @param {{ body?: string, number: number }[]} issues
 */
export function findExistingReportIssue(issues) {
  return issues.find((issue) => issue.body?.includes(REPORT_ISSUE_MARKER)) ?? null;
}
