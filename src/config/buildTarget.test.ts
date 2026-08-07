import fs from 'fs';
import path from 'path';
import { BUILD_TARGETS, getBuildTarget, resolveBuildTarget } from './buildTarget';

describe('getBuildTarget', () => {
  const originalTarget = globalThis.__GFC_BUILD_TARGET__;

  afterEach(() => {
    globalThis.__GFC_BUILD_TARGET__ = originalTarget;
  });

  test('resolves every target from the shared typed contract', () => {
    for (const target of BUILD_TARGETS) {
      expect(resolveBuildTarget(target)).toBe(target);
    }
  });

  test('defaults only an omitted target to local', () => {
    expect(resolveBuildTarget()).toBe('local');
    for (const target of ['', 'preview', 'Production', ' beta ']) {
      expect(() => resolveBuildTarget(target)).toThrow(/Invalid VITE_BUILD_TARGET/);
    }
  });

  test('hosted workflow builds declare their target explicitly', () => {
    const repoRoot = path.resolve(__dirname, '../..');
    const betaWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/release-beta.yml'), 'utf8');
    const productionWorkflow = fs.readFileSync(
      path.join(repoRoot, '.github/workflows/deploy-main-to-vps.yml'),
      'utf8'
    );

    expect(betaWorkflow).toMatch(/VITE_BUILD_TARGET:\s*beta/);
    expect(productionWorkflow).toMatch(/VITE_BUILD_TARGET:\s*production/);
    expect(productionWorkflow).toMatch(/VITE_BUILD_TARGET:\s*staging/);
  });

  test.each(['local', 'beta', 'staging', 'production'] as const)(
    'returns the embedded %s target',
    (target) => {
      globalThis.__GFC_BUILD_TARGET__ = target;
      expect(getBuildTarget()).toBe(target);
    }
  );
});
