import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('categorical Turf bundle boundary', () => {
  test('keeps Turf-backed processing out of eager UI imports', () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'src/hooks/categoricalWorker.ts'), 'utf8');
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

    expect(workerSource).not.toMatch(/import\s+\{[^}]*processDay12OutlooksToCategorical[^}]*\}\s+from\s+['"]\.\/autoCategoricalProcessing/);
    expect(workerSource).toMatch(/await import\(['"]\.\/autoCategoricalProcessing['"]\)/);
    expect(appSource).not.toMatch(/from ['"]\.\/pages['"]/);

    const assetsDirectory = resolve(process.cwd(), 'build/assets');
    expect(existsSync(assetsDirectory)).toBe(true);
    {
      const assetNames = readdirSync(assetsDirectory);
      const mainAsset = assetNames.find((name) => /^index-.*\.js$/.test(name));
      expect(mainAsset).toBeDefined();
      if (mainAsset) {
        const mainBundle = readFileSync(resolve(assetsDirectory, mainAsset), 'utf8');
        // Vite's __vite__mapDeps table legitimately names the lazy Turf chunk.
        // Only reject an eager module edge from the main entry itself.
        expect(mainBundle).not.toMatch(/(?:from|import\()\s*['"][^'"]*turf[^'"]*['"]/);
      }
    }
  });
});
