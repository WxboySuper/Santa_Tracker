import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import { boundaryFor, buildInventory, classifyPath, extractRelativeImports, resolveImport } from './generate-repository-inventory.mjs';

describe('repository inventory helpers', () => {
  test('classifies the major repository boundaries', () => {
    assert.equal(classifyPath('src/pages/ForecastPage.tsx'), 'frontend');
    assert.equal(classifyPath('server/lib/capability.js'), 'server');
    assert.equal(classifyPath('scripts/lib/changelog.mjs'), 'automation');
    assert.equal(classifyPath('docs/README.md'), 'documentation');
  });

  test('extracts and sorts relative imports without package imports', () => {
    const source = [
      'const fixture = "import fake from \'./fake\'";',
      '// require(\'./comment\')',
      'import x from \'./x\';',
      'const y = require(\'../y\');',
      'import \'./style.css\';',
      'import \'react\';',
    ].join('\n');
    assert.deepEqual(extractRelativeImports(source), ['../y', './x']);
  });

  test('maps only meaningful repository roots to ownership boundaries', () => {
    assert.equal(boundaryFor('src/pages/ForecastPage.tsx'), 'src/pages');
    assert.equal(boundaryFor('docs/README.md'), 'docs');
    assert.equal(boundaryFor('.env.production'), null);
  });

  test('resolves extensionless relative imports against known files', () => {
    const knownFiles = new Set(['src/pages/Page.tsx', 'src/utils/helper.ts']);
    assert.equal(resolveImport('src/pages/Page.tsx', '../utils/helper', knownFiles), 'src/utils/helper.ts');
  });

  test('builds dependency edges from a temporary repository fixture', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'gfc-inventory-'));
    try {
      await mkdir(path.join(root, 'src', 'pages'), { recursive: true });
      await mkdir(path.join(root, 'src', 'utils'), { recursive: true });
      await writeFile(path.join(root, 'src', 'utils', 'helper.ts'), 'export const helper = true;');
      await writeFile(path.join(root, 'src', 'pages', 'Page.tsx'), "import { helper } from '../utils/helper';\nexport const Page = helper;");
      const inventory = await buildInventory(root);
      assert.equal(inventory.files.length, 2);
      assert.deepEqual(inventory.dependencyEdges, [{ from: 'src/pages', to: 'src/utils' }]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
