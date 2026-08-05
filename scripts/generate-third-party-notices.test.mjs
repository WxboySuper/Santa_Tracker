import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectThirdPartyDependencies, renderNotices } from './generate-third-party-notices.mjs';

describe('third-party notice generation', () => {
  it('collects dependencies from root, server, and python manifests', () => {
    const entries = collectThirdPartyDependencies();
    assert.ok(entries.length > 10);
    assert.ok(entries.some((entry) => entry.source === 'root (pnpm)'));
    assert.ok(entries.some((entry) => entry.source === 'server (npm)'));
    assert.ok(entries.some((entry) => entry.source === 'server (python)'));
  });

  it('renders a notice line per dependency', () => {
    const entries = collectThirdPartyDependencies();
    const notices = renderNotices(entries);
    assert.match(notices, /# Third-Party Notices/);
    assert.ok(notices.split('\n').filter((line) => line.startsWith('- **')).length >= entries.length - 1);
  });

  it('reports a license category for every collected dependency', async () => {
    const { classifyLicense } = await import('./lib/license-policy.mjs');
    const entries = collectThirdPartyDependencies();
    for (const entry of entries) {
      const policy = classifyLicense(entry.license);
      assert.ok(policy.category, `missing category for ${entry.name}`);
    }
  });
});
