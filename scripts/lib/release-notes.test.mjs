import test from 'node:test';
import assert from 'node:assert/strict';
import { composeReleaseNotes, selectPreviousReleaseTag } from './release-notes.mjs';

const releases = [
  { tagName: 'v1.6.6', isPrerelease: false },
  { tagName: 'v1.7.0-beta.8', isPrerelease: true },
  { tagName: 'v1.7.0-beta.9', isPrerelease: true },
  { tagName: 'v1.5.4', isPrerelease: false },
];

test('selects the previous beta on the same beta line', () => {
  assert.equal(selectPreviousReleaseTag({ version: '1.7.0-beta.10', releases }), 'v1.7.0-beta.9');
});

test('selects the latest stable release before a new stable version', () => {
  assert.equal(selectPreviousReleaseTag({ version: '1.7.0', releases }), 'v1.6.6');
});

test('keeps curated notes primary for stable releases', () => {
  const notes = composeReleaseNotes({
    mode: 'changelog-and-prs',
    curatedNotes: '## v1.6.7\n\n### Fixed\n- Corrected the hotfix.',
    generatedNotes: '## What\'s Changed\n- #123 Fix the issue',
  });
  assert.match(notes, /^## v1\.6\.7/);
  assert.ok(notes.indexOf('Corrected') < notes.indexOf("What's Changed"));
});

test('uses native PR notes for beta releases', () => {
  const notes = composeReleaseNotes({
    mode: 'prs',
    curatedNotes: '## v1.7.0-beta.1\n\nInternal notes',
    generatedNotes: '## What\'s Changed\n- #456 New feature',
    changelogUrl: 'https://github.com/example/repo/blob/main/CHANGELOG.md',
  });
  assert.match(notes, /#456 New feature/);
  assert.match(notes, /Full curated changelog/);
  assert.doesNotMatch(notes, /Internal notes/);
});
