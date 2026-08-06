import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateChangelogPolicy, isChangelogSkip, parseChangelogDeclaration } from './changelog-policy.mjs';

/** @param {'beta' | 'hotfix'} impact @param {string} changelog */
const evaluateLane = (impact, changelog) => evaluateChangelogPolicy({
  changedFiles: ['CHANGELOG.md'],
  body: `Changelog-Impact: ${impact}`,
  changelog,
});

test('requires exactly one changelog impact declaration', () => {
  assert.equal(parseChangelogDeclaration('## Changelog').ok, false);
  assert.equal(parseChangelogDeclaration('Changelog-Impact: beta\nChangelog-Impact: none').ok, false);
});

test('requires a reason for no changelog impact', () => {
  assert.equal(parseChangelogDeclaration('Changelog-Impact: none').ok, false);
  assert.equal(parseChangelogDeclaration('Changelog-Impact: none\nChangelog-Reason: workflow-only').ok, true);
});

test('requires the production changelog for hotfix impact', () => {
  const result = evaluateChangelogPolicy({
    baseRef: 'stable/1.6.x',
    changedFiles: ['src/App.tsx'],
    body: 'Changelog-Impact: hotfix',
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /CHANGELOG\.md/);
});

test('allows beta impact on the next-major main changelog lane', () => {
  const result = evaluateChangelogPolicy({
    baseRef: 'main',
    changedFiles: ['CHANGELOG.md'],
    body: 'Changelog-Impact: beta',
    changelog: '# Changelog\n\n### Next major / beta\n',
  });
  assert.equal(result.ok, true);
});

test('allows a forward port to inherit its source changelog entry', () => {
  const result = evaluateChangelogPolicy({
    baseRef: 'main',
    changedFiles: ['src/App.tsx'],
    body: 'Changelog-Impact: inherited\nPort of #123',
  });
  assert.equal(result.ok, true);
});
test('requires beta entries in the next-major lane on main', () => {
  const result = evaluateLane('beta', '# Changelog\n\n### Stable 1.6.x hotfixes\n');
  assert.equal(result.ok, false);
  assert.match(result.reason, /Next major \/ beta/);
});

test('requires hotfix entries in the stable lane', () => {
  const result = evaluateLane('hotfix', '# Changelog\n\n### Next major / beta\n');
  assert.equal(result.ok, false);
  assert.match(result.reason, /Stable 1.6.x hotfixes/);
});

test('requires the declared lane to change, not merely exist', () => {
  const changelog = '# Changelog\n\n### Next major / beta\n\n- Existing\n';
  const result = evaluateChangelogPolicy({
    baseRef: 'main',
    changedFiles: ['CHANGELOG.md'],
    body: 'Changelog-Impact: beta',
    changelog,
    baseChangelog: changelog,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /must add or change/);
});

test('derives the stable changelog lane from the stable branch name', () => {
  const result = evaluateChangelogPolicy({
    baseRef: 'stable/1.7.x',
    changedFiles: ['CHANGELOG.md'],
    body: 'Changelog-Impact: hotfix',
    changelog: '# Changelog\n\n### Stable 1.7.x hotfixes\n\n- Fixed\n',
    baseChangelog: '# Changelog\n\n### Stable 1.7.x hotfixes\n',
  });
  assert.equal(result.ok, true);
});

test('exposes the impact on a successful evaluation', () => {
  const result = evaluateChangelogPolicy({
    baseRef: 'main',
    changedFiles: ['CHANGELOG.md'],
    body: 'Changelog-Impact: beta',
    changelog: '# Changelog\n\n### Next major / beta\n',
  });
  assert.equal(result.ok, true);
  assert.equal(result.impact, 'beta');
  assert.equal(isChangelogSkip(result.impact), false);
});

test('classifies waived and inherited impacts as changelog skips', () => {
  assert.equal(isChangelogSkip('none'), true);
  assert.equal(isChangelogSkip('inherited'), true);
  assert.equal(isChangelogSkip('beta'), false);
  assert.equal(isChangelogSkip('hotfix'), false);
  assert.equal(isChangelogSkip(undefined), false);
});

test('a waived impact that still modifies the changelog fails the check', () => {
  const result = evaluateChangelogPolicy({
    baseRef: 'main',
    changedFiles: ['CHANGELOG.md'],
    body: 'Changelog-Impact: none\nChangelog-Reason: workflow-only',
    changelog: '# Changelog\n',
  });
  assert.equal(result.ok, false);
  assert.equal(result.impact, 'none');
});
