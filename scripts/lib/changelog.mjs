import { deriveStableVersion, hasBetaPrerelease } from './package-version.mjs';
import { extractLaneReleaseNotes } from './changelog-lanes.mjs';

export { extractChangelogLane } from './changelog-lanes.mjs';


/**
 * @param {string} changelog
 * @returns {string | null}
 */
export const extractUnreleasedSection = (changelog) => {
  const heading = '## [Unreleased]';
  const start = changelog.indexOf(heading);
  if (start === -1) return null;

  const afterHeading = start + heading.length;
  const rest = changelog.slice(afterHeading);
  const nextSection = rest.search(/\n## /);
  const body = (nextSection === -1 ? rest : rest.slice(0, nextSection)).trim();
  if (!body) return null;

  return `${heading}\n\n${body}`.trim();
};

/**
 * @param {string} changelog
 * @param {string} stableVersion e.g. 1.6.0
 * @returns {string | null}
 */
export const extractChangelogSection = (changelog, stableVersion) => {
  const [major, minor] = stableVersion.split('.');
  const headings = [
    `## v${stableVersion}`,
    `## v${major}.${minor}`,
    `## v${major}.${Number(minor)}`,
  ];

  for (const heading of headings) {
    const start = changelog.indexOf(heading);
    if (start === -1) continue;

    const afterHeading = start + heading.length;
    const rest = changelog.slice(afterHeading);
    const nextSection = rest.search(/\n## v[0-9]/);
    const body = (nextSection === -1 ? rest : rest.slice(0, nextSection)).trim();
    if (body) {
      return `${heading}\n\n${body}`.trim();
    }
  }

  return null;
};

/** @param {string} changelog @param {string} version @returns {string | null} */
const legacyReleaseNotes = (changelog, version) => {
  const stable = deriveStableVersion(version) ?? version;
  const section = extractChangelogSection(changelog, stable);
  if (section) return section;
  if (!hasBetaPrerelease(version)) return null;
  const unreleased = extractUnreleasedSection(changelog);
  if (!unreleased) return null;
  const body = unreleased.replace(/^## \[Unreleased\]\s*\n*/i, '').trim();
  return `## v${version}\n\n${body}`.trim();
};

/**
 * Notes body for a GitHub Release tag (stable or beta prerelease).
 * @param {string} changelog
 * @param {string} version e.g. 1.6.0 or 1.6.0-beta.2
 * @param {string} [lane] next-major or stable-hotfix
 * @returns {string | null}
 */
export const extractReleaseNotes = (changelog, version, lane = '') => {
  const laneNotes = lane === 'next-major' || lane === 'stable-hotfix'
    ? extractLaneReleaseNotes(changelog, version, lane)
    : null;
  return laneNotes ?? legacyReleaseNotes(changelog, version);
};

/**
 * @param {string[]} changedFiles
 * @param {string} prBody
 */
