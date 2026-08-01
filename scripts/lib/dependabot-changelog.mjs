import { execFileSync } from 'node:child_process';

export const DEPENDENCIES_HEADING = '### Dependencies';
export const DEPENDENCIES_MARKER = '<!-- dependabot-automation -->';

const PACKAGE_JSON_PATHS = ['package.json', 'server/package.json'];
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies'];
const ROOT_DIRECTORY_LABELS = new Set(['root', '.', '']);

/**
 * @param {string} directory
 */
export const packageDirectoryLabel = (directory) => {
  const normalized = String(directory ?? '').trim();
  if (ROOT_DIRECTORY_LABELS.has(normalized)) return 'root';
  return normalized.replace(/\/$/, '');
};

/**
 * @param {string} changelog
 * @param {number} afterStart
 */
const sectionEndIndex = (changelog, afterStart) => {
  const rest = changelog.slice(afterStart);
  const next = rest.search(/\n## /);
  return next === -1 ? changelog.length : afterStart + next;
};

/**
 * @param {string} changelog
 * @returns {{ heading: string; start: number; end: number } | null}
 */
export const findDependabotChangelogSection = (changelog) => {
  const unreleased = changelog.indexOf('## [Unreleased]');
  if (unreleased !== -1) {
    const heading = '## [Unreleased]';
    return {
      heading,
      start: unreleased,
      end: sectionEndIndex(changelog, unreleased + heading.length),
    };
  }

  const match = changelog.match(/^## v[\d.]+/m);
  if (!match || match.index === undefined) return null;

  return {
    heading: match[0],
    start: match.index,
    end: sectionEndIndex(changelog, match.index + match[0].length),
  };
};

/**
 * @param {string} changelog
 * @param {{ heading: string; start: number; end: number }} section
 * @returns {string | null}
 */
export const extractDependenciesSubsection = (changelog, section) => {
  const body = changelog.slice(section.start, section.end);
  const escapedHeading = DEPENDENCIES_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(new RegExp(`#{3,4} Dependencies[\\s\\S]*?(?=\\n### (?!#)|\\n## |$)`));
  if (!match) return null;

  return match[0].replace(/^#{3,4} Dependencies/, '').replace(DEPENDENCIES_MARKER, '').trim();
};

/**
 * @param {{ name: string; from: string; to: string; directory: string }} bump
 */
export const formatDependencyChangelogBullet = ({ name, from, to, directory }) => {
  const label = packageDirectoryLabel(directory);
  const scope = label === 'root' ? '' : ` (\`${label}\`)`;
  return `- **${name}:** ${from} → ${to}${scope}`;
};

/**
 * @param {string} value
 */
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} line
 * @param {string} packageName
 */
export const dependencyBulletCoversPackage = (line, packageName) =>
  new RegExp(`\\*\\*${escapeRegExp(packageName)}:\\*\\*`).test(line);

/**
 * @param {string} line
 * @param {{ name: string; directory: string }} bump
 */
export const dependencyBulletMatchesBump = (line, bump) => {
  if (!dependencyBulletCoversPackage(line, bump.name)) return false;

  const label = packageDirectoryLabel(bump.directory);
  if (label === 'root') return !/\s\(`/.test(line);

  return line.includes(`(\`${label}\`)`);
};

/**
 * @param {{ name: string; from: string; to: string; directory: string }} bump
 * @param {string} dependenciesBody
 */
export const dependencyBumpDocumented = (bump, dependenciesBody) =>
  dependenciesBody
    .split('\n')
    .some((line) => {
      const trimmed = line.trim();
      return (
        dependencyBulletMatchesBump(trimmed, bump) &&
        trimmed.includes(bump.from) &&
        trimmed.includes(bump.to)
      );
    });

/**
 * @param {string} baseRef
 * @param {string} headRef
 * @param {string} packagePath
 */
const readPackageJsonPairAtRefs = (baseRef, headRef, packagePath) => {
  try {
    return {
      basePackage: JSON.parse(
        execFileSync('git', ['show', `origin/${baseRef}:${packagePath}`], { encoding: 'utf8' }),
      ),
      headPackage: JSON.parse(
        execFileSync('git', ['show', `origin/${headRef}:${packagePath}`], { encoding: 'utf8' }),
      ),
      directory: packagePath === 'package.json' ? 'root' : 'server',
    };
  } catch {
    return null;
  }
};

/**
 * @param {Record<string, string>} baseDeps
 * @param {Record<string, string>} headDeps
 * @param {string} directory
 * @param {string} depType
 */
const bumpsForDependencyField = (baseDeps, headDeps, directory, depType) => {
  const bumps = [];
  for (const [name, to] of Object.entries(headDeps)) {
    const from = baseDeps[name];
    if (from !== undefined && from !== to) {
      bumps.push({ name, from, to, directory, depType });
    }
  }
  return bumps;
};

/**
 * @param {object} basePkg
 * @param {object} headPkg
 * @param {string} directory
 */
const collectBumpsFromPackagePair = (basePkg, headPkg, directory) =>
  DEPENDENCY_FIELDS.flatMap((depType) =>
    bumpsForDependencyField(basePkg[depType] ?? {}, headPkg[depType] ?? {}, directory, depType),
  );

/**
 * @param {string} baseRef
 * @param {string} headRef
 */
export const listDependencyBumpsBetweenRefs = (baseRef, headRef) =>
  PACKAGE_JSON_PATHS.flatMap((packagePath) => {
    const pair = readPackageJsonPairAtRefs(baseRef, headRef, packagePath);
    return pair
      ? collectBumpsFromPackagePair(pair.basePackage, pair.headPackage, pair.directory)
      : [];
  });

/**
 * @param {string} depsBody
 */
const parseDependencyLines = (depsBody) =>
  depsBody
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith('- **') && line.includes(':**'));

/**
 * @param {string[]} lines
 * @param {Array<{ name: string; from: string; to: string; directory: string }>} bumps
 */
const mergeDependencyLines = (lines, bumps) => {
  const merged = [...lines];
  for (const bump of bumps) {
    const bullet = formatDependencyChangelogBullet(bump);
    const existingIndex = merged.findIndex((line) => dependencyBulletMatchesBump(line, bump));
    if (existingIndex === -1) merged.push(bullet);
    else if (!merged[existingIndex].includes(bump.to)) merged[existingIndex] = bullet;
  }
  return merged;
};

/**
 * @param {string[]} lines
 */
const formatDependenciesBlock = (lines) =>
  [DEPENDENCIES_HEADING, DEPENDENCIES_MARKER, '', ...lines, ''].join('\n');

/**
 * @param {string} sectionBody
 * @param {string} dependenciesBlock
 */
const replaceDependenciesBlock = (sectionBody, dependenciesBlock, lane = '') => {
  const escapedHeading = DEPENDENCIES_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const depsHeading = lane ? '#### Dependencies' : DEPENDENCIES_HEADING;
  const depsPattern = new RegExp(`${depsHeading.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}[\\s\\S]*?(?=\\n### (?!#)|\\n## |$)`);
  const stripped = sectionBody.replace(depsPattern, '').trimEnd();
  const headingEnd = stripped.indexOf('\n');
  const insertPos = headingEnd === -1 ? stripped.length : headingEnd + 1;
  return `${stripped.slice(0, insertPos)}\n${dependenciesBlock}${stripped.slice(insertPos)}`;
};

/**
 * @param {string} changelog
 * @param {Array<{ name: string; from: string; to: string; directory: string }>} bumps
 */
const applyDependencyBumpsToSection = (changelog, bumps) => {
  if (bumps.length === 0) return changelog;

  const section = findDependabotChangelogSection(changelog);
  if (!section) {
    throw new Error(
      'CHANGELOG.md must include ## [Unreleased] or a top ## vX.Y section for dependency entries.',
    );
  }

  const existingDepsBody = extractDependenciesSubsection(changelog, section);
  if (existingDepsBody && bumps.every((bump) => dependencyBumpDocumented(bump, existingDepsBody))) {
    return changelog;
  }

  const lines = mergeDependencyLines(parseDependencyLines(existingDepsBody ?? ''), bumps);
  const sectionBody = replaceDependenciesBlock(
    changelog.slice(section.start, section.end),
    formatDependenciesBlock(lines),
  );

  return changelog.slice(0, section.start) + sectionBody + changelog.slice(section.end);
};

const laneHeading = (lane) => lane === 'stable-hotfix' ? '### Stable 1.6.x hotfixes' : '### Next major / beta';

const laneBounds = (changelog, lane) => {
  const heading = laneHeading(lane);
  const start = changelog.indexOf(heading);
  if (start === -1) return null;
  const rest = changelog.slice(start + heading.length);
  const next = rest.search(/\n### (?!#)|\n## /);
  return {
    heading,
    start,
    end: next === -1 ? changelog.length : start + heading.length + next,
  };
};

/** Applies dependency automation to the selected unreleased lane. */
export const applyDependencyBumpsToChangelog = (changelog, bumps, lane = '') => {
  if (!lane) return applyDependencyBumpsToSection(changelog, bumps);
  const bounds = laneBounds(changelog, lane);
  if (!bounds) return applyDependencyBumpsToSection(changelog, bumps);
  const body = changelog.slice(bounds.start + bounds.heading.length, bounds.end);
  const synthetic = `## [Unreleased]\n${body}\n## [Lane end]`;
  const updated = applyDependencyBumpsToSection(synthetic, bumps);
  const innerStart = updated.indexOf('\n') + 1;
  const innerEnd = updated.indexOf('\n## [Lane end]');
  const updatedBody = updated.slice(innerStart, innerEnd).replace(/\n### Dependencies\n/g, '\n#### Dependencies\n');
  return changelog.slice(0, bounds.start + bounds.heading.length) + updatedBody + changelog.slice(bounds.end);
};

/**
 * @param {string[]} changedFiles
 * @param {string} changelogAtHead
 * @param {Array<{ name: string; from: string; to: string; directory: string }>} bumps
 */
const evaluateDependabotChangelogTouchesPr = (changedFiles, changelogAtHead, bumps) => {
  const touchesChangelog = changedFiles.some(
    (file) => file === 'CHANGELOG.md' || file.endsWith('/CHANGELOG.md'),
  );

  if (!touchesChangelog) {
    return {
      ok: false,
      reason:
        'Dependabot PRs must update CHANGELOG.md (the dependabot-changelog workflow commits ### Dependencies entries).',
    };
  }

  const section = findDependabotChangelogSection(changelogAtHead);
  if (!section) {
    return {
      ok: false,
      reason: 'CHANGELOG.md needs ## [Unreleased] or a top ## vX.Y section for ### Dependencies.',
    };
  }

  const depsBody = extractDependenciesSubsection(changelogAtHead, section);
  if (!depsBody || !/^-\s/m.test(depsBody)) {
    return {
      ok: false,
      reason: 'CHANGELOG.md ### Dependencies must list at least one dependency bump bullet.',
    };
  }

  const missing = bumps.filter((bump) => !dependencyBumpDocumented(bump, depsBody));
  if (missing.length > 0) {
    const names = missing.map((bump) => bump.name).join(', ');
    return {
      ok: false,
      reason: `CHANGELOG.md ### Dependencies is missing entries for: ${names}.`,
    };
  }

  return {
    ok: true,
    reason: 'CHANGELOG.md ### Dependencies documents this dependency bump.',
  };
};

/** Validates that Dependabot documented bumps in the selected lane. */
export const dependabotChangelogTouchesPr = (changedFiles, changelogAtHead, bumps, lane = '') => {
  if (!lane) return evaluateDependabotChangelogTouchesPr(changedFiles, changelogAtHead, bumps);
  const bounds = laneBounds(changelogAtHead, lane);
  if (!bounds) return evaluateDependabotChangelogTouchesPr(changedFiles, changelogAtHead, bumps);
  const body = changelogAtHead.slice(bounds.start + bounds.heading.length, bounds.end);
  const synthetic = `## [Unreleased]\n${body}\n## [Lane end]`;
  return evaluateDependabotChangelogTouchesPr(changedFiles, synthetic, bumps);
};
