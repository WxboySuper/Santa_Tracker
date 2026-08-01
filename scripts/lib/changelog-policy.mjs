const IMPACT_PATTERN = /^Changelog-Impact:\s*(beta|hotfix|none|inherited)\s*$/gim;
const REASON_PATTERN = /^Changelog-Reason:\s*(\S.*)$/im;
const SOURCE_PATTERN = /(?:port|backport|forward[- ]port|inherited)\s+(?:of\s+)?#(\d+)/i;

/** @typedef {'beta' | 'hotfix' | 'none' | 'inherited'} ChangelogImpact */

/**
 * @param {string} body
 * @returns {{ ok: true; impact: ChangelogImpact; reason?: string; sourcePr?: number } | { ok: false; reason: string }}
 */
export const parseChangelogDeclaration = (body = '') => {
  const matches = [...body.matchAll(IMPACT_PATTERN)].map((match) => match[1].toLowerCase());
  if (matches.length !== 1) {
    return {
      ok: false,
      reason: 'PR body must contain exactly one Changelog-Impact: beta|hotfix|none|inherited declaration.',
    };
  }

  const impact = /** @type {ChangelogImpact} */ (matches[0]);
  const reason = body.match(REASON_PATTERN)?.[1]?.trim();
  const sourcePr = Number(body.match(SOURCE_PATTERN)?.[1] ?? 0) || undefined;

  if (impact === 'none' && !reason) {
    return {
      ok: false,
      reason: 'Changelog-Impact: none requires a non-empty Changelog-Reason declaration.',
    };
  }

  if (impact === 'inherited' && !sourcePr) {
    return {
      ok: false,
      reason: 'Changelog-Impact: inherited requires a port/backport/forward-port reference such as "Port of #123".',
    };
  }

  return { ok: true, impact, reason, sourcePr };
};

/**
 * @param {{ baseRef: string; changedFiles: string[]; body: string }} context
 */
export const evaluateChangelogPolicy = ({ baseRef, changedFiles, body }) => {
  const declaration = parseChangelogDeclaration(body);
  if (!declaration.ok) return declaration;

  const changelogPath = baseRef === 'beta' ? 'CHANGELOG.beta.md' : 'CHANGELOG.md';
  const changedChangelog = changedFiles.includes(changelogPath);

  if (declaration.impact === 'none') {
    if (changedChangelog) {
      return {
        ok: false,
        reason: `Changelog-Impact: none cannot modify ${changelogPath}; choose beta or hotfix instead.`,
      };
    }
    return { ok: true, reason: `Changelog impact explicitly waived: ${declaration.reason}` };
  }

  if (declaration.impact === 'inherited') {
    return { ok: true, reason: `Changelog entry inherited from PR #${declaration.sourcePr}.` };
  }

  if (!changedChangelog) {
    return {
      ok: false,
      reason: `Changelog-Impact: ${declaration.impact} requires ${changelogPath} to be modified in this PR.`,
    };
  }

  return { ok: true, reason: `${changelogPath} documents ${declaration.impact} impact.` };
};
