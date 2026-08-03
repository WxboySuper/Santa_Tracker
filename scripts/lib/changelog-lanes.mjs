export const CHANGELOG_LANE_HEADINGS = {
  'next-major': '### Next major / beta',
  'stable-hotfix': '### Stable 1.6.x hotfixes',
};

/** @param {string} lane @returns {string} */
export const changelogLaneHeading = (lane) =>
  CHANGELOG_LANE_HEADINGS[lane] ?? CHANGELOG_LANE_HEADINGS['next-major'];

/**
 * @param {string} changelog
 * @param {string} lane
 * @returns {{ heading: string; start: number; end: number } | null}
 */
export const findChangelogLaneBounds = (changelog, lane) => {
  const heading = changelogLaneHeading(lane);
  const start = changelog.indexOf(heading);
  if (start === -1) return null;

  const bodyStart = start + heading.length;
  const rest = changelog.slice(bodyStart);
  const nextSection = rest.search(/\n### (?!#)|\n## /);
  return {
    heading,
    start,
    end: nextSection === -1 ? changelog.length : bodyStart + nextSection,
  };
};

/** @param {string} changelog @param {'next-major' | 'stable-hotfix'} lane */
export const extractChangelogLane = (changelog, lane) => {
  const bounds = findChangelogLaneBounds(changelog, lane);
  if (!bounds) return null;
  const body = changelog.slice(bounds.start + bounds.heading.length, bounds.end).trim();
  return body ? `${bounds.heading}\n\n${body}`.trim() : null;
};

/** @param {string} changelog @param {string} version @param {'next-major' | 'stable-hotfix'} lane */
export const extractLaneReleaseNotes = (changelog, version, lane) => {
  const laneSection = extractChangelogLane(changelog, lane);
  if (!laneSection) return null;
  const heading = changelogLaneHeading(lane);
  const body = laneSection.slice(heading.length).trim();
  return body ? `## v${version}\n\n${body}`.trim() : null;
};
