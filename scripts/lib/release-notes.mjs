import { execFileSync } from 'node:child_process';

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/;

/** Parse a stable or beta release tag into comparable version parts. */
const parseTag = (tagName) => {
  const match = String(tagName ?? '').match(VERSION_PATTERN);
  if (!match) return null;
  return {
    tagName,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    beta: match[4] === undefined ? null : Number(match[4]),
  };
};

/** Compare stable version parts in ascending semantic-version order. */
const compareStable = (left, right) =>
  (left.major - right.major) || (left.minor - right.minor) || (left.patch - right.patch);

/** @param {{ parsed: ReturnType<typeof parseTag> }} release @param {ReturnType<typeof parseTag>} target */
const isPreviousBeta = ({ parsed: candidate }, target) =>
  candidate && target &&
  candidate.major === target.major &&
  candidate.minor === target.minor &&
  candidate.patch === target.patch &&
  candidate.beta !== null &&
  target.beta !== null &&
  candidate.beta < target.beta;

/** @param {Array<{ tagName: string; parsed: ReturnType<typeof parseTag> }>} releases @param {ReturnType<typeof parseTag>} target */
const selectPreviousBetaTag = (releases, target) => releases
  .filter((release) => isPreviousBeta(release, target))
  .sort((left, right) => right.parsed.beta - left.parsed.beta)[0]?.tagName ?? null;

/** @param {{ parsed: ReturnType<typeof parseTag>; isPrerelease?: boolean }} release @param {ReturnType<typeof parseTag>} target */
const isPreviousStable = ({ parsed: candidate, isPrerelease }, target) =>
  candidate && target &&
  !isPrerelease &&
  candidate.beta === null &&
  compareStable(candidate, target) < 0;

/** @param {Array<{ tagName: string; isPrerelease?: boolean; parsed: ReturnType<typeof parseTag> }>} releases @param {ReturnType<typeof parseTag>} target */
const selectPreviousStableTag = (releases, target) => releases
  .filter((release) => isPreviousStable(release, target))
  .sort((left, right) => compareStable(right.parsed, left.parsed))[0]?.tagName ?? null;

/** @param {{ version: string; releases: Array<{ tagName: string; isPrerelease?: boolean }> }} context */
export const selectPreviousReleaseTag = ({ version, releases }) => {
  const target = parseTag(version);
  if (!target) return null;
  const parsed = releases
    .map((release) => ({ ...release, parsed: parseTag(release.tagName) }))
    .filter((release) => release.parsed);

  return target.beta !== null
    ? selectPreviousBetaTag(parsed, target)
    : selectPreviousStableTag(parsed, target);
};

/** @param {string | null | undefined} value */
const clean = (value) => String(value ?? '').trim();

/** Add a link back to the curated changelog when one is available. */
const withChangelogLink = (notes, changelogUrl) => {
  if (!notes) return '';
  const link = changelogUrl ? `\n\nFull curated changelog: ${changelogUrl}` : '';
  return `${notes}${link}`.trim();
};

/** Compose the beta-facing PR-note mode. */
const composePrNotes = ({ curated, generated, changelogUrl }) =>
  withChangelogLink(generated, changelogUrl)
    || curated
    || 'No merged pull requests were found for this release.';

/** Compose the stable-facing curated notes with an optional PR appendix. */
const composeChangelogAndPrNotes = ({ curated, generated }) =>
  curated && generated
    ? `${curated}\n\n---\n\n${generated}`.trim()
    : curated || generated || 'No release notes were generated.';

/** @param {{ mode: 'changelog' | 'prs' | 'changelog-and-prs'; curatedNotes?: string; generatedNotes?: string; changelogUrl?: string }} options */
export const composeReleaseNotes = ({ mode, curatedNotes = '', generatedNotes = '', changelogUrl = '' }) => {
  const curated = clean(curatedNotes);
  const generated = clean(generatedNotes);
  if (mode === 'prs') return composePrNotes({ curated, generated, changelogUrl });
  if (mode === 'changelog-and-prs') return composeChangelogAndPrNotes({ curated, generated });
  return withChangelogLink(curated || generated || 'No release notes were generated.', changelogUrl);
};

/** @param {{ command: string[]; input?: string }} options */
const runGh = ({ command, input }) => execFileSync('gh', command, {
  input,
  encoding: 'utf8',
  stdio: input === undefined ? ['ignore', 'pipe', 'inherit'] : ['pipe', 'pipe', 'inherit'],
});

/** @param {string} repository */
export const listGitHubReleases = (repository) => JSON.parse(runGh({
  command: ['release', 'list', '--repo', repository, '--limit', '1000', '--json', 'tagName,isPrerelease,publishedAt'],
}) || '[]');

/** @param {{ repository: string; tag: string; targetBranch: string; previousTag?: string | null; configurationPath?: string }} options */
export const generateGitHubReleaseNotes = ({ repository, tag, targetBranch, previousTag, configurationPath }) => {
  const payload = {
    tag_name: tag,
    target_commitish: targetBranch,
    ...(previousTag ? { previous_tag_name: previousTag } : {}),
    ...(configurationPath ? { configuration_file_path: configurationPath } : {}),
  };
  const output = runGh({
    command: ['api', `repos/${repository}/releases/generate-notes`, '--method', 'POST', '--input', '-'],
    input: JSON.stringify(payload),
  });
  return JSON.parse(output || '{}').body ?? '';
};
