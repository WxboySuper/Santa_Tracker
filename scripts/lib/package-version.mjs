/** @typedef {{ ok: true }} VersionPolicyOk */
/** @typedef {{ ok: false, message: string }} VersionPolicyFail */
/** @typedef {VersionPolicyOk | VersionPolicyFail} VersionPolicyResult */

const BETA_PRERELEASE_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+-beta\.[0-9]+$/i;
const STABLE_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const RELEASE_BRANCH_PATTERN = /^release\/v[0-9]+\.[0-9]+\.[0-9]+$/;
const STABLE_LINE_PATTERN = /^stable\/[0-9]+\.[0-9]+\.x$/;

/**
 * @param {string} message
 * @returns {VersionPolicyFail}
 */
const policyFail = (message) => ({ ok: false, message });

/**
 * @param {string} version
 */
export const hasBetaPrerelease = (version) => BETA_PRERELEASE_PATTERN.test(version);

/**
 * @param {string} version
 * @returns {string | null}
 */
export const deriveStableVersion = (version) => {
  const stable = version.replace(/-beta(\.[0-9A-Za-z.-]*)?$/i, '');
  if (stable === version) {
    return STABLE_VERSION_PATTERN.test(stable) ? stable : null;
  }
  return STABLE_VERSION_PATTERN.test(stable) ? stable : null;
};

/**
 * @param {string} stableVersion
 */
export const releaseBranchForStable = (stableVersion) => `release/v${stableVersion}`;

/**
 * @param {string} headRef
 */
export const isReleasePromotionBranch = (headRef) => RELEASE_BRANCH_PATTERN.test(headRef);

/**
 * @param {string} version
 * @param {string} targetBranch
 * @returns {VersionPolicyResult | null}
 */
const validateStableLineVersion = (version, targetBranch) => {
  if (!STABLE_LINE_PATTERN.test(targetBranch)) {
    return null;
  }
  if (hasBetaPrerelease(version) || !STABLE_VERSION_PATTERN.test(version)) {
    return policyFail(
      `Stable line "${targetBranch}" requires a stable semver package version, got "${version}".`,
    );
  }
  return null;
};

/**
 * @param {string} version
 * @returns {VersionPolicyResult}
 */
const validateMainVersion = (version) => {
  if (STABLE_VERSION_PATTERN.test(version) || hasBetaPrerelease(version)) {
    return { ok: true };
  }
  return policyFail(`Main requires a stable semver or beta prerelease package version, got "${version}".`);
};

/**
 * @param {{
 *   version: string;
 *   targetBranch: string;
 * }} context
 * @returns {VersionPolicyResult}
 */
export const evaluateVersionPolicy = ({ version, targetBranch }) => {
  const stableLineResult = validateStableLineVersion(version, targetBranch);
  if (stableLineResult) return stableLineResult;

  if (targetBranch === 'main') {
    // main is the next-major integration line. It may contain either a stable
    // version during promotion or a beta prerelease between snapshots.
    return validateMainVersion(version);
  }

  return { ok: true };
};
