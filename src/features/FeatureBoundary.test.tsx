import { render, screen } from '@testing-library/react';
import { FEATURE_EXPOSURE_REGISTRY } from '../config/featureExposure';
import { FeatureBoundary } from './FeatureBoundary';
import {
  ALL_TARGETS_OFF,
  createSideEffectProbe,
  mockFeatureExposure,
  runWithBuildTarget,
  singleTargetOn,
} from '../testing/featureExposure/harness';

describe('FeatureBoundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders children only when the feature is exposed', () => {
    mockFeatureExposure('autoTstm', ALL_TARGETS_OFF);

    const { rerender } = render(
      <FeatureBoundary feature="autoTstm">
        <div>Auto-TSTM controls</div>
      </FeatureBoundary>
    );

    expect(screen.queryByText('Auto-TSTM controls')).not.toBeInTheDocument();

    jest.restoreAllMocks();
    runWithBuildTarget('beta', () => {
      mockFeatureExposure('autoTstm', singleTargetOn('beta'));

      rerender(
        <FeatureBoundary feature="autoTstm">
          <div>Auto-TSTM controls</div>
        </FeatureBoundary>
      );

      expect(screen.getByText('Auto-TSTM controls')).toBeInTheDocument();
    });
  });

  test('does not run gated effects while the feature remains disabled', () => {
    mockFeatureExposure('autoTstm', ALL_TARGETS_OFF);
    const { spy, Probe } = createSideEffectProbe('autoTstm');

    render(
      <FeatureBoundary feature="autoTstm">
        <Probe />
      </FeatureBoundary>
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test('runs gated effects when the feature is exposed', () => {
    runWithBuildTarget('beta', () => {
      mockFeatureExposure('autoTstm', singleTargetOn('beta'));
      const { spy, Probe } = createSideEffectProbe('autoTstm');

      render(<Probe />);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(FEATURE_EXPOSURE_REGISTRY.autoTstm.serverCapabilityKey).toBe('TSTM_GENERATION_ENABLED');
    });
  });
});
