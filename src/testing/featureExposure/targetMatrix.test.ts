import { BUILD_TARGETS } from '../../config/buildTarget';
import { runWithBuildTarget, withNoAsyncSideEffects } from './harness';

describe('feature exposure target matrix helpers', () => {
  const originalTarget = globalThis.__GFC_BUILD_TARGET__;

  afterEach(() => {
    globalThis.__GFC_BUILD_TARGET__ = originalTarget;
  });

  test('runWithBuildTarget keeps the target active until async work finishes', async () => {
    const seenTargets: Array<typeof globalThis.__GFC_BUILD_TARGET__> = [];

    await runWithBuildTarget('staging', async () => {
      seenTargets.push(globalThis.__GFC_BUILD_TARGET__);
      await Promise.resolve();
      seenTargets.push(globalThis.__GFC_BUILD_TARGET__);
    });

    expect(seenTargets).toEqual(['staging', 'staging']);
    expect(globalThis.__GFC_BUILD_TARGET__).toBe(originalTarget);
  });

  test('withNoAsyncSideEffects works when Worker is not defined', () => {
    const originalWorker = global.Worker;
    Reflect.deleteProperty(global, 'Worker');

    try {
      expect(() =>
        withNoAsyncSideEffects(() => {
          expect('Worker' in global).toBe(true);
        })
      ).not.toThrow();
    } finally {
      if (originalWorker) {
        global.Worker = originalWorker;
      } else {
        Reflect.deleteProperty(global, 'Worker');
      }
    }
  });

  test.each(BUILD_TARGETS)('runWithBuildTarget applies %s synchronously', (target) => {
    runWithBuildTarget(target, () => {
      expect(globalThis.__GFC_BUILD_TARGET__).toBe(target);
    });
    expect(globalThis.__GFC_BUILD_TARGET__).toBe(originalTarget);
  });
});
