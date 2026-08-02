/** @typedef {{ ok: true, kind: string }} BranchPolicyOk */
/** @typedef {{ ok: false, message: string }} BranchPolicyFail */
/** @typedef {BranchPolicyOk | BranchPolicyFail} BranchPolicyResult */

const PORT_BRANCH_PATTERN = /^port\/\d+-to-/;
const RELEASE_INFRA_BRANCH_PATTERN = /^feature\/release-/;
const STABLE_BRANCH_PATTERN = /^stable\/\d+\.\d+\.x$/;

/**
 * @param {string} headRef
 */
export const isFeatureBranch = (headRef) => headRef.startsWith('feature/');

/**
 * @param {string} headRef
 */
export const isFixBranch = (headRef) => headRef.startsWith('fix/');

/**
 * @param {string} headRef
 */
export const isHotfixBranch = (headRef) => headRef.startsWith('hotfix/');

/**
 * @param {string} headRef
 */
export const isPortBranch = (headRef) => PORT_BRANCH_PATTERN.test(headRef);

/**
 * @param {string} headRef
 * @returns {BranchPolicyResult}
 */
const evaluateMainTarget = (headRef) => {
  if (headRef === 'beta') {
    return { ok: true, kind: 'beta-promotion' };
  }
  if (isHotfixBranch(headRef)) {
    return { ok: true, kind: 'hotfix' };
  }
  if (headRef.startsWith('release/')) {
    return { ok: true, kind: 'release' };
  }
  if (RELEASE_INFRA_BRANCH_PATTERN.test(headRef)) {
    return { ok: true, kind: 'release-infrastructure' };
  }
  if (isPortBranch(headRef)) {
    return { ok: true, kind: 'port' };
  }
  // main is the next-major integration line. Source branch naming is not a
  // merge gate; required checks and review determine whether a PR is ready.
  return { ok: true, kind: 'main-integration' };
};

/**
 * @param {string} headRef
 * @returns {BranchPolicyResult}
 */
const evaluateBetaTarget = (headRef) => {
  if (isHotfixBranch(headRef)) {
    return { ok: false, message: 'hotfix/* branches merge into main, not beta.' };
  }
  if (headRef === 'main') {
    return { ok: false, message: 'Do not open PRs from main into beta.' };
  }
  if (isFeatureBranch(headRef)) {
    return { ok: true, kind: 'beta-integration-feature' };
  }
  if (isFixBranch(headRef)) {
    return { ok: true, kind: 'beta-integration-fix' };
  }
  if (isPortBranch(headRef) || headRef === 'beta') {
    return { ok: true, kind: 'beta-integration' };
  }
  return { ok: true, kind: 'beta-integration-other' };
};

/**
 * Branch routing for protected integration branches.
 *
 * @param {{ baseRef: string; headRef: string }} context
 * @returns {BranchPolicyResult}
 */
export const evaluateBranchPolicy = ({ baseRef, headRef }) => {
  if (baseRef === 'main') {
    return evaluateMainTarget(headRef);
  }
  if (STABLE_BRANCH_PATTERN.test(baseRef)) {
    if (isPortBranch(headRef)) return { ok: true, kind: 'port' };
    if (isHotfixBranch(headRef)) return { ok: true, kind: 'hotfix' };
    if (headRef.startsWith('release/')) return { ok: true, kind: 'release' };
    return { ok: true, kind: 'stable-maintenance' };
  }
  if (baseRef === 'beta') {
    return evaluateBetaTarget(headRef);
  }
  return { ok: true, kind: 'other' };
};
