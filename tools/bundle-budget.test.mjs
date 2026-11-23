import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareBudgets, measureAssets, renderReport } from './bundle-budget.mjs';

describe('compareBudgets', () => {
  it('passes assets at or below each tier limit', () => {
    expect(
      compareBudgets({ public: { js: 100, css: 20 } }, { public: { js: 100, css: 25 } }),
    ).toEqual([
      { tier: 'public', kind: 'js', actual: 100, limit: 100, passed: true },
      { tier: 'public', kind: 'css', actual: 20, limit: 25, passed: true },
    ]);
  });

  it('flags exceeded budgets', () => {
    expect(compareBudgets({ '3d': { js: 101, css: 10 } }, { '3d': { js: 100, css: 10 } })).toEqual([
      { tier: '3d', kind: 'js', actual: 101, limit: 100, passed: false },
      { tier: '3d', kind: 'css', actual: 10, limit: 10, passed: true },
    ]);
  });

  it('fails when a tier measurement is missing or empty against a non-zero budget', () => {
    expect(() => compareBudgets({}, { public: { js: 1, css: 1 } })).toThrow(
      'Missing bundle measurement for tier "public"',
    );
    expect(() =>
      compareBudgets({ public: { js: 0, css: 0 } }, { public: { js: 1, css: 0 } }),
    ).toThrow('measured 0 bytes');
  });

  it('fails when a type measurement is missing', () => {
    expect(() => compareBudgets({ public: { js: 1 } }, { public: { js: 1, css: 1 } })).toThrow(
      'Missing CSS measurement',
    );
  });
});

function makeBuildOutput({ includeAssets = true, includeReferences = true } = {}) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-budget-'));
  const staticDir = path.join(outDir, '_next', 'static', 'chunks');
  fs.mkdirSync(path.join(outDir, '.vite'), { recursive: true });
  if (includeAssets) {
    fs.mkdirSync(staticDir, { recursive: true });
    for (const name of [
      'entry.js',
      'framework.js',
      'village.js',
      'three.js',
      'admin.js',
      'map.js',
      'map-core.js',
      'map-deep.js',
      'unreachable-village.js',
    ]) {
      fs.writeFileSync(
        path.join(staticDir, name),
        `export const ${name.replaceAll('.', '_')} = 'sample';`,
      );
    }
    fs.writeFileSync(path.join(outDir, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  }
  fs.writeFileSync(
    path.join(outDir, '.vite', 'manifest.json'),
    JSON.stringify({
      'src/main.ts': {
        file: '_next/static/chunks/entry.js',
        isEntry: true,
        imports: ['shared.js', 'src/components/village/village-world.ts'],
        dynamicImports: ['src/components/village/village-world.ts', 'src/app/admin/page.tsx'],
      },
      'shared.js': { file: '_next/static/chunks/framework.js' },
      'src/components/village/village-world.ts': {
        file: '_next/static/chunks/village.js',
        imports: ['node_modules/three/build/three.module.js', 'shared.js'],
      },
      'node_modules/three/build/three.module.js': { file: '_next/static/chunks/three.js' },
      'virtual:admin-page': {
        file: '_next/static/chunks/admin.js',
        name: 'page',
        isDynamicEntry: true,
      },
      'virtual:tracker-map': {
        file: '_next/static/chunks/map.js',
        isDynamicEntry: true,
        dynamicImports: ['src/lib/map-core.ts'],
      },
      'src/lib/map-core.ts': {
        file: '_next/static/chunks/map-core.js',
        dynamicImports: ['src/lib/map-deep.ts'],
      },
      'src/lib/map-deep.ts': {
        file: '_next/static/chunks/map-deep.js',
        dynamicImports: ['src/components/tracker-3d/tracker-art.ts'],
      },
      'vendor-extra': { file: '_next/static/chunks/unreachable-village.js', name: 'vendor-extra' },
    }),
  );
  if (includeReferences) {
    fs.writeFileSync(
      path.join(outDir, '.vite', 'vinext-client-reference-sources.json'),
      JSON.stringify({
        'src/app/(admin)/admin/page.tsx': '_next/static/chunks/admin.js',
        'src/app/(public)/tracker/tracker-map.tsx': '_next/static/chunks/map.js',
        'src/components/village/village-experience.tsx': '_next/static/chunks/village.js',
      }),
    );
  }
  return outDir;
}

describe('measureAssets', () => {
  it('attributes realistic static-directory manifest assets by graph reachability', () => {
    const outDir = makeBuildOutput();
    try {
      const result = measureAssets(outDir);
      const tierFor = (name) =>
        result.assets.find((asset) => asset.file === name || asset.file.endsWith(`/${name}`)).tier;
      expect(tierFor('entry.js')).toBe('public');
      expect(tierFor('sw.js')).toBe('public');
      expect(result.unattributedAssetCount).toBe(1);
      expect(result.warnings).toContain(
        '1 client asset(s) had no manifest graph or filename attribution and were charged to the public tier.',
      );
      expect(tierFor('framework.js')).toBe('public, 3d');
      expect(tierFor('village.js')).toBe('public, 3d');
      expect(tierFor('three.js')).toBe('public, 3d');
      expect(tierFor('admin.js')).toBe('admin');
      expect(tierFor('map.js')).toBe('public');
      expect(tierFor('map-core.js')).toBe('public');
      expect(tierFor('map-deep.js')).toBe('public');
      expect(tierFor('unreachable-village.js')).toBe('3d');
      expect(result.assets.find((asset) => asset.file.endsWith('framework.js')).owners).toContain(
        'shared.js',
      );
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('uses manifest-only attribution and reports a missing reference file', () => {
    const outDir = makeBuildOutput({ includeReferences: false });
    try {
      const result = measureAssets(outDir);
      const report = renderReport(result, {}, []);
      expect(result.assets.find((asset) => asset.file.endsWith('admin.js')).tier).toBe('admin');
      expect(result.assets.find((asset) => asset.file.endsWith('sw.js')).tier).toBe('public');
      expect(report).toContain(
        'Client reference source file is missing. Attribution uses the Vite manifest graph only.',
      );
      expect(report).toContain('1 client asset(s)');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('fails closed for a missing manifest or empty asset scan', () => {
    const missingManifest = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-budget-empty-'));
    try {
      expect(() => measureAssets(missingManifest)).toThrow('Vite manifest not found');
    } finally {
      fs.rmSync(missingManifest, { recursive: true, force: true });
    }

    const emptyAssets = makeBuildOutput({ includeAssets: false });
    try {
      expect(() => measureAssets(emptyAssets)).toThrow('No client JS or CSS assets found');
    } finally {
      fs.rmSync(emptyAssets, { recursive: true, force: true });
    }
  });
});
