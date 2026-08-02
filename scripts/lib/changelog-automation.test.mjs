import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatManagedChangelogDeclaration,
  upsertManagedChangelogDeclaration,
} from './changelog-automation.mjs';

test('formats a beta declaration with the managed marker', () => {
  assert.equal(
    formatManagedChangelogDeclaration({ impact: 'beta' }),
    '<!-- gfc-changelog-declaration -->\nChangelog-Impact: beta\n<!-- end gfc-changelog-declaration -->',
  );
});

test('replaces an existing automated declaration without duplicates', () => {
  const body = [
    'Dependabot updated the runtime dependency.',
    '',
    '<!-- gfc-changelog-declaration -->',
    'Changelog-Impact: none',
    'Changelog-Reason: old answer',
    '<!-- end gfc-changelog-declaration -->',
  ].join('\n');

  const next = upsertManagedChangelogDeclaration(body, { impact: 'hotfix' });
  assert.equal((next.match(/Changelog-Impact:/g) ?? []).length, 1);
  assert.match(next, /Changelog-Impact: hotfix/);
  assert.match(next, /Dependabot updated/);
  assert.doesNotMatch(next, /old answer/);
});

test('writes a reason and source reference for automated no-impact and port decisions', () => {
  const none = upsertManagedChangelogDeclaration('Original body', {
    impact: 'none',
    reason: 'CI-only update.',
  });
  const inherited = upsertManagedChangelogDeclaration('Original body', {
    impact: 'inherited',
    sourcePr: 123,
  });

  assert.match(none, /Changelog-Reason: CI-only update\./);
  assert.match(inherited, /Changelog-Impact: inherited/);
  assert.match(inherited, /Port of #123/);
});
