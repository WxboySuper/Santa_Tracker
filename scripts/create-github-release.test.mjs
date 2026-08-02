import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCuratedNotes,
  buildReleaseNotes,
  resolvePreviousTag,
  validateReleaseInputs,
} from './create-github-release.mjs';

const releases = [
  { tagName: 'v1.6.6', isPrerelease: false },
  { tagName: 'v1.7.0-beta.8', isPrerelease: true },
  { tagName: 'v1.7.0-beta.9', isPrerelease: true },
];

test('validates release version and target ref inputs', () => {
  assert.doesNotThrow(() => validateReleaseInputs({ version: '1.7.0-beta.1', targetBranch: 'main' }));
  assert.throws(() => validateReleaseInputs({ version: 'latest', targetBranch: 'main' }), /Usage:/);
  assert.throws(() => validateReleaseInputs({ version: '1.7.0', targetBranch: 'bad ref' }), /Invalid target branch/);
});

test('skips release lookup for curated-only notes', () => {
  assert.equal(resolvePreviousTag({
    mode: 'changelog',
    version: '1.7.0',
    repository: 'example/repo',
    releases,
  }), null);
});

test('honors an explicit previous release tag', () => {
  assert.equal(resolvePreviousTag({
    mode: 'prs',
    explicitPreviousTag: 'v1.6.6',
    version: '1.7.0',
    repository: 'example/repo',
    releases,
  }), 'v1.6.6');
});

test('builds curated notes through the selected changelog lane', () => {
  const notes = buildCuratedNotes({
    changelog: '## [Unreleased]\n\n- Beta improvement.',
    version: '1.7.0-beta.1',
    lane: 'next-major',
  });
  assert.match(notes, /Beta improvement/);
});

test('composes the final release body from curated and generated notes', () => {
  const notes = buildReleaseNotes({
    mode: 'changelog-and-prs',
    curatedNotes: '## v1.6.7\n\n- Stable fix.',
    generatedNotes: '## What\'s Changed\n\n- #123 Fix',
    changelogUrl: 'https://github.com/example/repo/blob/main/CHANGELOG.md',
  });
  assert.match(notes, /Stable fix/);
  assert.match(notes, /#123 Fix/);
});
