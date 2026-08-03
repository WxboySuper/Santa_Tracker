import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('generate-exposure-report integration', () => {
  it('prints the current registry report and exits successfully', () => {
    const result = spawnSync(process.execPath, ['scripts/generate-exposure-report.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    assert.equal(
      result.status,
      0,
      [result.stdout, result.stderr].filter(Boolean).join('\n')
    );
    assert.match(result.stdout, /Production-enabled:/);
    assert.match(result.stdout, /exportMap/);
  });
});
