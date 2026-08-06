import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { parseDeclaredDatasets, sha256Of, verifyVendoredDatasets } from './validate-geo-assets.mjs';

const ROOT = resolve(import.meta.dirname, '..');

describe('vendored boundary dataset validation', () => {
  test('parses exactly the three declared datasets', () => {
    const datasets = parseDeclaredDatasets();
    assert.equal(datasets.length, 3);
    const keys = datasets.map((d) => d.key).sort();
    assert.deepEqual(keys, ['lakes', 'usStates', 'worldCountries']);
  });

  test('every declared dataset exists and matches its pinned checksum', () => {
    const datasets = parseDeclaredDatasets();
    assert.ok(datasets.length > 0);
    for (const dataset of datasets) {
      const path = resolve(ROOT, dataset.vendoredPath);
      assert.ok(readFileSync(path), `dataset file missing: ${dataset.vendoredPath}`);
      assert.equal(
        sha256Of(path).toUpperCase(),
        dataset.sha256,
        `checksum drift for ${dataset.vendoredPath}`,
      );
    }
  });

  test('verifyVendoredDatasets reports success for all checked-in files', () => {
    const results = verifyVendoredDatasets(parseDeclaredDatasets());
    assert.ok(results.every((r) => r.ok), results.filter((r) => !r.ok).map((r) => r.error));
  });

  test('sha256Of computes the expected digest for a known file', () => {
    const fixture = resolve(ROOT, 'src/config/geoBoundarySources.ts');
    const digest = sha256Of(fixture);
    const expected = createHash('sha256').update(readFileSync(fixture)).digest('hex');
    assert.equal(digest, expected);
  });
});
