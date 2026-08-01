import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateChangelogPolicy, parseChangelogDeclaration } from './changelog-policy.mjs';

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
