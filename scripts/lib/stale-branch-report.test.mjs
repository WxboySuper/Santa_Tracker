import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  GRACE_PERIOD_DAYS,
  REPORT_ISSUE_MARKER,
  ageInDays,
  buildStaleBranchReport,
  findExistingReportIssue,
  formatAuthor,
  formatBehindBeta,
  formatOpenPr,
  formatStaleBranchReport,
  isStaleBranch,
  isTrackedBranch,
} from './stale-branch-report.mjs';

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/stale-branch-report.json'
);

describe('stale branch report', () => {
  it('tracks feature, fix, and research prefixes only', () => {
    assert.equal(isTrackedBranch('feature/foo'), true);
    assert.equal(isTrackedBranch('fix/bar'), true);
    assert.equal(isTrackedBranch('research/spike'), true);
    assert.equal(isTrackedBranch('chore/docs'), false);
  });

  it('excludes protected and automation-managed branches', () => {
    assert.equal(isTrackedBranch('main'), false);
    assert.equal(isTrackedBranch('beta'), false);
    assert.equal(isTrackedBranch('port/123-to-beta'), false);
    assert.equal(isTrackedBranch('dependabot/npm_foo'), false);
    assert.equal(isTrackedBranch('release/1.7'), false);
    assert.equal(isTrackedBranch('hotfix/urgent'), false);
    assert.equal(isTrackedBranch('feature/release-prep'), false);
  });

  it('uses a strict grace-period boundary', () => {
    const now = new Date('2026-06-29T12:00:00.000Z');
    assert.equal(ageInDays('2026-06-16T12:00:00.000Z', now), 13);
    assert.equal(isStaleBranch(13), false);
    assert.equal(ageInDays('2026-06-15T12:00:00.000Z', now), 14);
    assert.equal(isStaleBranch(14), false);
    assert.equal(ageInDays('2026-06-14T12:00:00.000Z', now), 15);
    assert.equal(isStaleBranch(15), true);
    assert.equal(GRACE_PERIOD_DAYS, 14);
  });

  it('classifies orphaned branches separately from open PR branches', async () => {
    const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
    const report = buildStaleBranchReport({
      branches: fixture.branches,
      openPulls: fixture.openPulls,
      now: new Date(fixture.now),
      baseBranch: fixture.baseBranch,
    });

    assert.equal(report.staleRows.length, 2);
    assert.equal(report.activeWithinGraceCount, 2);
    assert.deepEqual(
      report.staleRows.map((row) => row.name).sort(),
      ['feature/old-work', 'research/abandoned-spike']
    );
    assert.equal(
      report.staleRows.find((row) => row.name === 'feature/old-work')?.openPrNumber,
      null
    );
    assert.equal(
      report.staleRows.find((row) => row.name === 'research/abandoned-spike')?.behindBy,
      null
    );
  });

  it('formats behind-beta and open PR values deterministically', () => {
    assert.equal(formatBehindBeta(12), '12');
    assert.equal(formatBehindBeta(null), 'unknown');
    assert.equal(formatOpenPr(null), 'orphaned');
    assert.equal(formatAuthor('alice', 'Alice Example'), '`alice`');
    assert.equal(formatAuthor(null, 'Alice Example'), 'Alice Example');
    assert.equal(
      formatOpenPr(501, 'WxboySuper/Graphical-Forecast-Creator'),
      '[#501](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/501)'
    );
  });

  it('renders stable markdown for fixture data', async () => {
    const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
    const report = buildStaleBranchReport({
      branches: fixture.branches,
      openPulls: fixture.openPulls,
      now: new Date(fixture.now),
      baseBranch: fixture.baseBranch,
    });

    const markdown = formatStaleBranchReport({
      ...report,
      repository: 'WxboySuper/Graphical-Forecast-Creator',
      runUrl: 'https://github.com/WxboySuper/Graphical-Forecast-Creator/actions/runs/1',
    });

    assert.match(markdown, new RegExp(REPORT_ISSUE_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(markdown, /### Orphaned \(no open PR\)/);
    assert.match(markdown, /`feature\/old-work`/);
    assert.match(markdown, /`research\/abandoned-spike`/);
    assert.match(markdown, /42/);
    assert.match(markdown, /unknown/);
    assert.match(markdown, /Stale branches: \*\*2\*\*/);
    assert.match(markdown, /Active within grace period: \*\*2\*\*/);
    assert.doesNotMatch(markdown, /`feature\/release-prep`/);
    assert.doesNotMatch(markdown, /`fix\/recent-fix`/);
  });

  it('finds the existing report issue by marker', () => {
    const found = findExistingReportIssue([
      { number: 1, body: 'unrelated' },
      { number: 2, body: `${REPORT_ISSUE_MARKER}\nreport` },
    ]);
    assert.equal(found?.number, 2);
  });
});
