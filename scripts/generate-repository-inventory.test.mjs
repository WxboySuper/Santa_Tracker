import { describe, expect, test } from '@jest/globals';
import { classifyPath, extractRelativeImports } from './generate-repository-inventory.mjs';

describe('repository inventory helpers', () => {
  test('classifies the major repository boundaries', () => {
    expect(classifyPath('src/pages/ForecastPage.tsx')).toBe('frontend');
    expect(classifyPath('server/lib/capability.js')).toBe('server');
    expect(classifyPath('scripts/lib/changelog.mjs')).toBe('automation');
    expect(classifyPath('docs/README.md')).toBe('documentation');
  });

  test('extracts and sorts relative imports without package imports', () => {
    expect(extractRelativeImports(`import x from './x';\nconst y = require('../y');\nimport 'react';`)).toEqual(['../y', './x']);
  });
});
