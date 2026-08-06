import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computePrLabels, descriptiveLabels, routingLabels } from './pr-labels.mjs';

/** Helper to build default computePrLabels arguments with optional overrides. */
const makeComputeArgs = (overrides) => ({
  head: 'feature/test',
  base: 'main',
  changedFiles: ['src/App.tsx'],
  mergeable: null,
  draft: false,
  changelog: { ok: true, skipped: false },
  ...overrides,
});

describe('pr routing labels', () => {
  it('tags stable promotion preparation', () => {
    const labels = routingLabels({ head: 'promotion/v2.0.0', base: 'main' });
    assert.ok(labels.has('promotion'));
  });

  it('keeps ordinary main source branches free of beta routing labels', () => {
    const labels = routingLabels({ head: 'chore/docs', base: 'main' });
    assert.equal(labels.has('promotion'), false);
  });
});

describe('pr descriptive labels', () => {
  it('tags fix branches as Bug', () => {
    const labels = descriptiveLabels({ head: 'fix/foo', changedFiles: ['src/App.tsx'] });
    assert.ok(labels.has('Bug'));
    assert.ok(labels.has('javascript'));
  });

  it('tags feature branches as Enhancement', () => {
    const labels = descriptiveLabels({ head: 'feature/foo', changedFiles: ['src/App.tsx'] });
    assert.ok(labels.has('Enhancement'));
  });

  it('tags refactor branches with routing and Refactor', () => {
    const routing = routingLabels({ head: 'refactor/labels', base: 'main' });
    assert.ok(routing.has('refactor'));

    const labels = descriptiveLabels({ head: 'refactor/labels', changedFiles: ['src/App.tsx'] });
    assert.ok(labels.has('Refactor'));
  });

  it('tags map changes with Component: Map', () => {
    const labels = descriptiveLabels({
      head: 'feature/map',
      changedFiles: ['src/components/Map/Foo.tsx'],
    });
    assert.ok(labels.has('Component: Map'));
  });

  it('tags workflow changes with quality', () => {
    const labels = descriptiveLabels({
      head: 'feature/release-version-policy',
      changedFiles: ['.github/workflows/ci.yml', 'scripts/lib/pr-labels.mjs'],
    });
    assert.ok(labels.has('quality'));
    assert.ok(labels.has('Enhancement'));
  });

  it('tags docs-only PRs as Documentation', () => {
    const labels = descriptiveLabels({
      head: 'chore/docs',
      changedFiles: ['docs/release-workflow.md', 'CHANGELOG.md'],
    });
    assert.equal(labels.has('javascript'), false);
    assert.ok(labels.has('Documentation'));
  });
});

describe('computePrLabels', () => {
  it('merges routing, descriptive, and changelog status', () => {
    const labels = computePrLabels(makeComputeArgs({
      head: 'fix/keyboard',
      changedFiles: ['src/components/Map/x.ts', 'CHANGELOG.md'],
      mergeable: true,
    }));
    assert.ok(labels.includes('fix'));
    assert.ok(labels.includes('Bug'));
    assert.ok(labels.includes('Component: Map'));
    assert.ok(labels.includes('changelog:ok'));
  });

  it('labels a missing changelog entry as changelog:missing', () => {
    const labels = computePrLabels(makeComputeArgs({
      changelog: { ok: false, skipped: false },
    }));
    assert.ok(labels.includes('changelog:missing'));
    assert.ok(!labels.includes('changelog:ok'));
    assert.ok(!labels.includes('changelog:skip'));
  });

  it('labels a waived changelog impact as changelog:skip', () => {
    const labels = computePrLabels(makeComputeArgs({
      changelog: { ok: true, skipped: true },
    }));
    assert.ok(labels.includes('changelog:skip'));
    assert.ok(!labels.includes('changelog:ok'));
    assert.ok(!labels.includes('changelog:missing'));
  });

  it('prefers changelog:missing over changelog:skip when the check fails', () => {
    const labels = computePrLabels(makeComputeArgs({
      changelog: { ok: false, skipped: true },
    }));
    assert.ok(labels.includes('changelog:missing'));
    assert.ok(!labels.includes('changelog:skip'));
    assert.ok(!labels.includes('changelog:ok'));
  });

  it('includes exposure labels when exposure files are changed', () => {
    const labels = computePrLabels(makeComputeArgs({
      head: 'feature/exposure',
      changedFiles: ['src/config/featureExposure.ts'],
    }));
    assert.ok(labels.includes('exposure:registry-change'));
    assert.ok(labels.includes('exposure:production'));
  });

  it('includes no exposure labels for unrelated changes', () => {
    const labels = computePrLabels(makeComputeArgs({
      head: 'fix/typo',
      changedFiles: ['src/components/Map/MapContainer.tsx'],
    }));
    assert.ok(!labels.includes('exposure:registry-change'));
    assert.ok(!labels.includes('exposure:server-backed'));
  });
});
