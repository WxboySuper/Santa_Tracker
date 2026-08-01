/** @typedef {{ ok: true }} VersionPolicyOk */
/** @typedef {{ ok: false, message: string }} VersionPolicyFail */
/** @typedef {VersionPolicyOk | VersionPolicyFail} VersionPolicyResult */

const BETA_PRERELEASE_PATTERN = /-beta(\.|$)/i;
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
 * @returns {VersionPolicyResult}
 */
const validateBetaTargetVersion = (version, targetBranch) => {
  if (targetBranch !== 'beta' || hasBetaPrerelease(version)) {
    return { ok: true };
  }
  return policyFail(
    `package.json version "${version}" must include a -beta prerelease on branch "${targetBranch}" ` +
      '(for example 1.6.0-beta.1).',
  );
};

/**
 * @param {{
 *   version: string;
 *   targetBranch: string;
 * }} context
 * @returns {VersionPolicyResult}
 */
export const evaluateVersionPolicy = ({ version, targetBranch }) => {
  const betaResult = validateBetaTargetVersion(version, targetBranch);
  if (!betaResult.ok) {
    return betaResult;
  }

  if (STABLE_LINE_PATTERN.test(targetBranch)) {
    if (hasBetaPrerelease(version) || !STABLE_VERSION_PATTERN.test(version)) {
      return policyFail(
        `Stable line "${targetBranch}" requires a stable semver package version, got "${version}".`,
      );
    }
  }

  if (targetBranch === 'main') {
    // main is the next-major integration line. It may temporarily contain a
    // stable version during cutover and beta prerelease versions afterward.
    return { ok: true };
  }

  return { ok: true };
};
