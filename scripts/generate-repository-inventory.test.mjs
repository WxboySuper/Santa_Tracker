import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { classifyPath, extractRelativeImports } from './generate-repository-inventory.mjs';

describe('repository inventory helpers', () => {
  test('classifies the major repository boundaries', () => {
    assert.equal(classifyPath('src/pages/ForecastPage.tsx'), 'frontend');
    assert.equal(classifyPath('server/lib/capability.js'), 'server');
    assert.equal(classifyPath('scripts/lib/changelog.mjs'), 'automation');
    assert.equal(classifyPath('docs/README.md'), 'documentation');
  });

  test('extracts and sorts relative imports without package imports', () => {
    assert.deepEqual(extractRelativeImports(`import x from './x';\nconst y = require('../y');\nimport 'react';`), ['../y', './x']);
  });
});
