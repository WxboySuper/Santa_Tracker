import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDependencyBumpsToChangelog,
  extractDependenciesSubsection,
  findDependabotChangelogSection,
  formatDependencyChangelogBullet,
} from './dependabot-changelog.mjs';

const sampleChangelog = `# Changelog

## [Unreleased]

### Changed
- Something

## v1.5.3
`;

describe('dependabot changelog', () => {
  it('finds Unreleased as the active section', () => {
    const section = findDependabotChangelogSection(sampleChangelog);
    assert.equal(section?.heading, '## [Unreleased]');
  });

  it('inserts and updates dependency bullets', () => {
    const bump = {
      name: 'express-rate-limit',
      from: '^8.5.1',
      to: '^8.5.2',
      directory: 'server',
    };
    const updated = applyDependencyBumpsToChangelog(sampleChangelog, [bump]);
    const section = findDependabotChangelogSection(updated);
    assert.ok(section);
    const deps = extractDependenciesSubsection(updated, section);
    assert.match(deps ?? '', /express-rate-limit/);
    assert.match(deps ?? '', /\^8\.5\.2/);

    const updatedAgain = applyDependencyBumpsToChangelog(updated, [bump]);
    assert.equal(updatedAgain, updated);
  });

  it('keeps separate bullets when the same package bumps in root and server', () => {
    const bumps = [
      { name: 'axios', from: '^1.7.0', to: '^1.7.9', directory: 'root' },
      { name: 'axios', from: '^1.7.0', to: '^1.7.9', directory: 'server' },
    ];
    const updated = applyDependencyBumpsToChangelog(sampleChangelog, bumps);
    const section = findDependabotChangelogSection(updated);
    const deps = extractDependenciesSubsection(updated, section);
    assert.match(deps ?? '', /- \*\*axios:\*\* \^1\.7\.0 → \^1\.7\.9\n/);
    assert.match(deps ?? '', /- \*\*axios:\*\* \^1\.7\.0 → \^1\.7\.9 \(`server`\)/);
  });

  it('does not treat another package line as documenting a different bump', () => {
    const changelog = applyDependencyBumpsToChangelog(sampleChangelog, [
      { name: 'postcss', from: '8.5.14', to: '8.5.15', directory: 'root' },
    ]);
    const undocumented = {
      name: 'express-rate-limit',
      from: '^8.5.1',
      to: '^8.5.2',
      directory: 'server',
    };
  });

  it('formats bullets with optional directory scope', () => {
    assert.equal(
      formatDependencyChangelogBullet({
        name: 'postcss',
        from: '8.5.14',
        to: '8.5.15',
        directory: 'root',
      }),
      '- **postcss:** 8.5.14 → 8.5.15',
    );
    assert.match(
      formatDependencyChangelogBullet({
        name: 'express-rate-limit',
        from: '^8.5.1',
        to: '^8.5.2',
        directory: 'server',
      }),
      /`server`/,
    );
  });

  it('writes dependency automation into the stable hotfix lane', () => {
    const changelog = '# Changelog\n\n## [Unreleased]\n\n### Next major / beta\n\n#### Added\n- Feature\n\n### Stable 1.6.x hotfixes\n\n#### Fixed\n- Fix\n';
    const bump = { name: 'postcss', from: '8.5.14', to: '8.5.15', directory: 'root' };
    const updated = applyDependencyBumpsToChangelog(changelog, [bump], 'stable-hotfix');
    assert.match(updated, /### Stable 1\.6\.x hotfixes[\s\S]*#### Dependencies[\s\S]*postcss/);
    assert.doesNotMatch(updated.slice(0, updated.indexOf('### Stable 1.6.x hotfixes')), /postcss/);
  });
});
