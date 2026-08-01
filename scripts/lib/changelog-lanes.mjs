const laneHeading = (lane) =>
  lane === 'stable-hotfix' ? '### Stable 1.6.x hotfixes' : '### Next major / beta';

/** @param {string} changelog @param {'next-major' | 'stable-hotfix'} lane */
export const extractChangelogLane = (changelog, lane) => {
  const heading = laneHeading(lane);
  const start = changelog.indexOf(heading);
  if (start === -1) return null;
  const rest = changelog.slice(start + heading.length);
  const nextLane = rest.search(/\n### (?!#)/);
  const body = (nextLane === -1 ? rest : rest.slice(0, nextLane)).trim();
  return body ? `${heading}\n\n${body}`.trim() : null;
};

/** @param {string} changelog @param {string} version @param {'next-major' | 'stable-hotfix'} lane */
export const extractLaneReleaseNotes = (changelog, version, lane) => {
  const laneSection = extractChangelogLane(changelog, lane);
  if (!laneSection) return null;
  const heading = laneSection.split('\n', 1)[0];
  const body = laneSection.slice(heading.length).trim();
  return body ? `## v${version}\n\n${body}`.trim() : null;
};
