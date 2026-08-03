import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('generate-exposure-diagnostics integration', () => {
  it('prints JSON diagnostics and exits successfully', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/generate-exposure-diagnostics.mjs', '--json', '--target', 'production', '--public'],
      {
        cwd: ROOT,
        encoding: 'utf8',
      }
    );

    assert.equal(
      result.status,
      0,
      [result.stdout, result.stderr].filter(Boolean).join('\n')
    );

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.buildTarget, 'production');
    assert.ok(Array.isArray(payload.features));
    assert.ok(payload.features.length > 0);
    assert.ok(payload.features.every((entry) => typeof entry.featureKey === 'string'));
    assert.ok(payload.features.every((entry) => typeof entry.reason === 'string'));
    assert.ok(payload.features.every((entry) => entry.owner === undefined));
  });

  it('prints human-readable diagnostics for local target', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/generate-exposure-diagnostics.mjs', '--target', 'local'],
      {
        cwd: ROOT,
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Feature exposure diagnostics \(local\)/);
    assert.match(result.stdout, /exportMap: enabled \(available\)/);
  });
});
