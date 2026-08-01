const IMPACT_PATTERN = /^Changelog-Impact:\s*(beta|hotfix|none|inherited)\s*$/gim;
const REASON_PATTERN = /^Changelog-Reason:\s*(\S.*)$/im;
const SOURCE_PATTERN = /(?:port|backport|forward[- ]port|inherited)\s+(?:of\s+)?#(\d+)/i;

/** @typedef {'beta' | 'hotfix' | 'none' | 'inherited'} ChangelogImpact */

export const CHANGELOG_LANE_HEADINGS = {
  'next-major': '### Next major / beta',
  'stable-hotfix': '### Stable 1.6.x hotfixes',
};

/** @param {string} baseRef */
export const changelogLaneForBase = (baseRef) =>
  /^stable\/\d+\.\d+\.x$/.test(baseRef) ? 'stable-hotfix' : 'next-major';

/** @param {string} baseRef */
export const changelogPathForBase = (baseRef) =>
  baseRef === 'beta' ? 'CHANGELOG.beta.md' : 'CHANGELOG.md';

/** @param {ChangelogImpact} impact */
const laneHeadingForImpact = (impact) =>
  impact === 'hotfix' ? CHANGELOG_LANE_HEADINGS['stable-hotfix'] : CHANGELOG_LANE_HEADINGS['next-major'];

/** @param {string[]} changedFiles @param {string} path @returns {boolean} */
const hasChangedChangelog = (changedFiles, path) => changedFiles.includes(path);

/** @param {{ impact: ChangelogImpact }} declaration @param {string} changelog @param {string} path */
const validateLane = (declaration, changelog, path) => {
  if (!changelog || path === 'CHANGELOG.beta.md') return null;
  const expectedLane = laneHeadingForImpact(declaration.impact);
  if (changelog.includes(expectedLane)) return null;
  return {
    ok: false,
    reason: `Changelog-Impact: ${declaration.impact} must update the ${expectedLane} lane in ${path}.`,
  };
};

/** @param {{ declaration: object; changedFiles: string[]; changelog: string; path: string }} context */
const validateImpactFile = ({ declaration, changedFiles, changelog, path }) => {
  if (declaration.impact === 'none') {
    return hasChangedChangelog(changedFiles, path)
      ? { ok: false, reason: `Changelog-Impact: none cannot modify ${path}; choose beta or hotfix instead.` }
      : { ok: true, reason: `Changelog impact explicitly waived: ${declaration.reason}` };
  }

  if (declaration.impact === 'inherited') {
    return { ok: true, reason: `Changelog entry inherited from PR #${declaration.sourcePr}.` };
  }

  if (!hasChangedChangelog(changedFiles, path)) {
    return {
      ok: false,
      reason: `Changelog-Impact: ${declaration.impact} requires ${path} to be modified in this PR.`,
    };
  }

  return validateLane(declaration, changelog, path) ?? {
    ok: true,
    reason: `${path} documents ${declaration.impact} impact.`,
  };
};

/** @param {string} reason */
const declarationError = (reason) => ({ ok: false, reason });

/** @param {string} body @returns {string[]} */
const impactMatches = (body) => [...body.matchAll(IMPACT_PATTERN)].map((match) => match[1].toLowerCase());

/** @param {string} body @param {ChangelogImpact} impact */
const parseDeclarationValues = (body, impact) => ({
  impact,
  reason: body.match(REASON_PATTERN)?.[1]?.trim(),
  sourcePr: Number(body.match(SOURCE_PATTERN)?.[1] ?? 0) || undefined,
});

/** @param {{ impact: ChangelogImpact; reason?: string; sourcePr?: number }} values */
const validateDeclarationValues = ({ impact, reason, sourcePr }) => {
  if (impact === 'none' && !reason) {
    return declarationError('Changelog-Impact: none requires a non-empty Changelog-Reason declaration.');
  }
  if (impact === 'inherited' && !sourcePr) {
    return declarationError(
      'Changelog-Impact: inherited requires a port/backport/forward-port reference such as "Port of #123".',
    );
  }
  return null;
};

/**
 * @param {string} body
 * @returns {{ ok: true; impact: ChangelogImpact; reason?: string; sourcePr?: number } | { ok: false; reason: string }}
 */
export const parseChangelogDeclaration = (body = '') => {
  const matches = impactMatches(body);
  if (matches.length !== 1) {
    return declarationError(
      'PR body must contain exactly one Changelog-Impact: beta|hotfix|none|inherited declaration.',
    );
  }

  const values = parseDeclarationValues(body, /** @type {ChangelogImpact} */ (matches[0]));
  const error = validateDeclarationValues(values);
  return error ?? { ok: true, ...values };
};

/**
 * @param {{ baseRef: string; changedFiles: string[]; body: string }} context
 */
export const evaluateChangelogPolicy = ({ baseRef, changedFiles, body, changelog = '' }) => {
  const declaration = parseChangelogDeclaration(body);
  if (!declaration.ok) return declaration;

  const changelogPath = changelogPathForBase(baseRef);
  return validateImpactFile({ declaration, changedFiles, changelog, path: changelogPath });
};
