import { execFileSync } from 'node:child_process';

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/;

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

const compareStable = (left, right) =>
  (left.major - right.major) || (left.minor - right.minor) || (left.patch - right.patch);

/** @param {{ version: string; releases: Array<{ tagName: string; isPrerelease?: boolean }> }} context */
export const selectPreviousReleaseTag = ({ version, releases }) => {
  const target = parseTag(version);
  if (!target) return null;
  const parsed = releases
    .map((release) => ({ ...release, parsed: parseTag(release.tagName) }))
    .filter((release) => release.parsed);

  if (target.beta !== null) {
    return parsed
      .filter(({ parsed: candidate }) =>
        candidate.major === target.major &&
        candidate.minor === target.minor &&
        candidate.patch === target.patch &&
        candidate.beta !== null &&
        candidate.beta < target.beta,
      )
      .sort((left, right) => right.parsed.beta - left.parsed.beta)[0]?.tagName ?? null;
  }

  return parsed
    .filter(({ parsed: candidate, isPrerelease }) =>
      !isPrerelease && candidate.beta === null && compareStable(candidate, target) < 0,
    )
    .sort((left, right) => compareStable(right.parsed, left.parsed))[0]?.tagName ?? null;
};

/** @param {string | null | undefined} value */
const clean = (value) => String(value ?? '').trim();

/** @param {{ mode: 'changelog' | 'prs' | 'changelog-and-prs'; curatedNotes?: string; generatedNotes?: string; changelogUrl?: string }} options */
export const composeReleaseNotes = ({ mode, curatedNotes = '', generatedNotes = '', changelogUrl = '' }) => {
  const curated = clean(curatedNotes);
  const generated = clean(generatedNotes);
  const link = changelogUrl ? `\n\nFull curated changelog: ${changelogUrl}` : '';

  if (mode === 'prs') {
    if (generated) return `${generated}${link}`.trim();
    return curated || 'No merged pull requests were found for this release.';
  }

  if (mode === 'changelog-and-prs') {
    if (curated && generated) return `${curated}\n\n---\n\n${generated}`.trim();
    return curated || generated || 'No release notes were generated.';
  }

  return `${curated || generated || 'No release notes were generated.'}${link}`.trim();
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
