import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { extractConst } from './feature-exposure-source-parser.mjs';
import { validateExposureMatrixDocument } from './feature-exposure-matrix-document.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const matrixPath = resolve(ROOT, 'docs/operations/v1.7-exposure-matrix.md');
const registryPath = resolve(ROOT, 'src/config/featureExposure.ts');

const markdown = readFileSync(matrixPath, 'utf8');
const registry = extractConst(readFileSync(registryPath, 'utf8'), 'featureExposure.ts', 'FEATURE_EXPOSURE_REGISTRY');

describe('v1.7 exposure matrix document', () => {
  it('matches every registry key and target value', () => {
    const result = validateExposureMatrixDocument(markdown, registry);
    assert.equal(result.ok, true, result.errors.join('\n'));
  });

  it('reports a documented target drift', () => {
    const drifted = markdown.replace(
      '| `customProducts` | [#431](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/431) | On | On | Off | Off |',
      '| `customProducts` | [#431](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/431) | On | On | On | Off |'
    );
    const result = validateExposureMatrixDocument(drifted, registry);
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /customProducts.*staging/);
  });
});
