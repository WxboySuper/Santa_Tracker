import { render, screen, waitFor } from '@testing-library/react';
import { BUILD_TARGETS } from '../../config/buildTarget';
import { FEATURE_EXPOSURE_REGISTRY } from '../../config/featureExposure';
import { FeatureBoundary } from '../../features/FeatureBoundary';
import { ServerBackedFeatureBoundary } from '../../features/ServerBackedFeatureBoundary';
import {
  ALL_TARGETS_OFF,
  assertGatedRoutesAbsent,
  assertNavigationHidden,
  assertNoFetchTo,
  createSideEffectProbe,
  mockFeatureExposure,
  mockFeatureExposureOnTarget,
  runFeatureExposureContract,
  runWithBuildTarget,
  singleTargetOn,
} from './harness';

jest.mock('../../pages/gated/TropicalWorkspacePage', () => ({
  __esModule: true,
  default: () => <div>Tropical workspace page</div>,
}));

describe('feature exposure exemplar contract', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('tropicalWorkspace client surfaces', () => {
    test.each(BUILD_TARGETS)(
      'keeps routes and navigation hidden on %s while registry exposure is off',
      (target) => {
        runWithBuildTarget(target, () => {
          assertGatedRoutesAbsent('tropicalWorkspace', [target]);
          assertNavigationHidden('tropicalWorkspace', [target]);
        });
      }
    );

    test('enables tropical surfaces only on the mocked enabled target', () => {
      const exposureSpy = mockFeatureExposureOnTarget('tropicalWorkspace', singleTargetOn('beta'));

      runWithBuildTarget('beta', () => {
        expect(
          require('../../routing/buildFeatureGatedRoutes').getExposedGatedRoutePaths('beta')
        ).toEqual(['/tropical', '/custom-products']);
      });

      exposureSpy.mockRestore();
    });
  });

  describe('autoTstm disabled side effects', () => {
    test.each(BUILD_TARGETS)(
      'does not run gated effects on %s while registry exposure is off',
      (target) => {
        mockFeatureExposure('autoTstm', ALL_TARGETS_OFF);
        const { spy, Probe } = createSideEffectProbe('autoTstm');

        runWithBuildTarget(target, () => {
          render(
            <FeatureBoundary feature="autoTstm">
              <Probe />
            </FeatureBoundary>
          );
        });

        expect(spy).not.toHaveBeenCalled();
      }
    );

    test('does not fetch capability status while compile-time exposure is disabled', async () => {
      jest.spyOn(require('../../config/featureExposure'), 'isFeatureExposed').mockReturnValue(false);

      await assertNoFetchTo('/api/capabilities/status', () => {
        render(
          <ServerBackedFeatureBoundary feature="autoTstm">
            <div>Auto-TSTM controls</div>
          </ServerBackedFeatureBoundary>
        );
      });

      expect(screen.queryByText('Auto-TSTM controls')).not.toBeInTheDocument();
    });

    test('runs gated effects when beta exposure is enabled in the matrix', () => {
      const { spy, Probe } = createSideEffectProbe('autoTstm');

      runWithBuildTarget('beta', () => {
        mockFeatureExposure('autoTstm', singleTargetOn('beta'));
        render(<Probe />);
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(FEATURE_EXPOSURE_REGISTRY.autoTstm.serverCapabilityKey).toBe('TSTM_GENERATION_ENABLED');
    });

    test('fetches capability status when compile-time exposure is enabled', async () => {
      jest.spyOn(require('../../config/featureExposure'), 'isFeatureExposed').mockReturnValue(true);
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          capabilities: {
            TSTM_GENERATION_ENABLED: {
              available: true,
              reason: 'available',
            },
          },
        }),
      }) as jest.Mock;

      try {
        render(
          <ServerBackedFeatureBoundary feature="autoTstm">
            <div>Auto-TSTM controls</div>
          </ServerBackedFeatureBoundary>
        );

        await waitFor(() => {
          expect(screen.getByText('Auto-TSTM controls')).toBeInTheDocument();
        });
        expect(global.fetch).toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('harness contract runner', () => {
    test('runs disabled assertions for every target in the matrix', async () => {
      const seenTargets: string[] = [];

      await runFeatureExposureContract({
        feature: 'collaborationRoom',
        surfaces: {
          routePaths: ['collaborate'],
          navigationIds: ['collaboration-room'],
        },
        runDisabledAssertions: ({ target }) => {
          seenTargets.push(target);
          assertGatedRoutesAbsent('collaborationRoom', [target]);
        },
      });

      expect(seenTargets).toEqual([...BUILD_TARGETS]);
    });
  });
});
