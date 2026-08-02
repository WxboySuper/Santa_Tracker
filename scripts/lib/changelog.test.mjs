import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractChangelogSection,
  extractReleaseNotes,
  extractUnreleasedSection,
} from './changelog.mjs';

const sample = `# Changelog

## [Unreleased]

### Added
- WIP feature

## v1.6

### Fixed
- Bug fix

## v1.5.3

### Changed
- Stable ship
`;

test('extractUnreleasedSection returns body under Unreleased', () => {
  const section = extractUnreleasedSection(sample);
  assert.match(section ?? '', /WIP feature/);
  assert.match(section ?? '', /\[Unreleased\]/);
});

test('extractChangelogSection matches minor line heading', () => {
  const section = extractChangelogSection(sample, '1.6.0');
  assert.match(section ?? '', /Bug fix/);
});

test('extractReleaseNotes uses line section for stable version', () => {
  const notes = extractReleaseNotes(sample, '1.5.3');
  assert.match(notes ?? '', /Stable ship/);
});

test('extractReleaseNotes uses line section for beta when minor line exists', () => {
  const notes = extractReleaseNotes(sample, '1.6.0-beta.4', 'next-major');
  assert.match(notes ?? '', /Bug fix/);
});

test('extractReleaseNotes falls back to Unreleased for beta without line section', () => {
  const changelog = `# Changelog\n\n## [Unreleased]\n\n### Added\n- WIP only\n`;
  const notes = extractReleaseNotes(changelog, '2.0.0-beta.1');
  assert.match(notes ?? '', /v2\.0\.0-beta\.1/);
  assert.match(notes ?? '', /WIP only/);
});
