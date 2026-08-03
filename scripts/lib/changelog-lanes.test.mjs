import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHANGELOG_LANE_HEADINGS,
  extractChangelogLane,
  extractLaneReleaseNotes,
  findChangelogLaneBounds,
} from './changelog-lanes.mjs';

const sample = '# Changelog\n\n### Next major / beta\n\n#### Added\n- Feature\n\n### Stable 1.6.x hotfixes\n\n#### Fixed\n- Fix\n';

test('extracts one lane without including its sibling', () => {
  const lane = extractChangelogLane(sample, 'next-major');
  assert.match(lane ?? '', /Feature/);
  assert.doesNotMatch(lane ?? '', /Fix/);
});

test('formats lane notes with the release version', () => {
  assert.match(extractLaneReleaseNotes(sample, '1.6.31', 'stable-hotfix') ?? '', /v1\.6\.31/);
});

test('shares lane headings and boundaries with lane consumers', () => {
  const bounds = findChangelogLaneBounds(sample, 'next-major');
  assert.equal(bounds?.heading, CHANGELOG_LANE_HEADINGS['next-major']);
  assert.match(sample.slice(bounds?.start ?? 0, bounds?.end), /Feature/);
  assert.doesNotMatch(sample.slice(bounds?.start ?? 0, bounds?.end), /Fix/);
});
