import { BUILD_TARGETS } from './buildTarget';
import {
  FEATURE_EXPOSURE_REGISTRY,
  getFeatureExposure,
  isFeatureExposedOnTarget,
  type FeatureKey,
} from './featureExposure';

/** Canonical v1.7 workstream keys — keep aligned with featureExposure.test.ts and CI policy. */
export const V17_WORKSTREAM_KEYS = [
  'autoTstm',
  'forecastWorkflowV2',
  'verificationRelaunch',
  'customProducts',
  'tropicalWorkspace',
  'collaborationRoom',
] as const satisfies readonly FeatureKey[];

type V17WorkstreamKey = (typeof V17_WORKSTREAM_KEYS)[number];

describe('v1.7 workstream adoption contract', () => {
  test('forecastWorkflowV2 is enabled for local development and beta testers', () => {
    for (const target of BUILD_TARGETS) {
      const expected = target === 'local' || target === 'beta';
      expect(isFeatureExposedOnTarget('forecastWorkflowV2', target)).toBe(expected);
      expect(FEATURE_EXPOSURE_REGISTRY.forecastWorkflowV2.exposure[target]).toBe(expected);
    }
  });

  test.each(
    V17_WORKSTREAM_KEYS.filter(
      (feature) =>
        !['autoTstm', 'forecastWorkflowV2', 'customProducts', 'verificationRelaunch'].includes(feature)
    )
  )(
    '%s stays disabled on every build target',
    (feature) => {
      for (const target of BUILD_TARGETS) {
        expect(isFeatureExposedOnTarget(feature, target)).toBe(false);
        expect(FEATURE_EXPOSURE_REGISTRY[feature].exposure[target]).toBe(false);
      }
    }
  );

  test('verificationRelaunch dogfoods on local only', () => {
    for (const target of BUILD_TARGETS) {
      const expected = target === 'local';
      expect(isFeatureExposedOnTarget('verificationRelaunch', target)).toBe(expected);
      expect(FEATURE_EXPOSURE_REGISTRY.verificationRelaunch.exposure[target]).toBe(expected);
    }
  });

  test('customProducts is enabled for local development and beta testing only', () => {
    for (const target of BUILD_TARGETS) {
      const expected = target === 'local' || target === 'beta';
      expect(isFeatureExposedOnTarget('customProducts', target)).toBe(expected);
      expect(FEATURE_EXPOSURE_REGISTRY.customProducts.exposure[target]).toBe(expected);
    }
  });

  test('autoTstm is enabled only on beta', () => {
    for (const target of BUILD_TARGETS) {
      const exposed = isFeatureExposedOnTarget('autoTstm', target);
      expect(exposed).toBe(target === 'beta');
      expect(FEATURE_EXPOSURE_REGISTRY.autoTstm.exposure[target]).toBe(target === 'beta');
    }
  });

  test.each(V17_WORKSTREAM_KEYS)('%s declares required lifecycle metadata', (feature) => {
    const definition = getFeatureExposure(feature);

    expect(definition.temporary).toBe(true);
    expect(definition.removalCondition.trim().length).toBeGreaterThan(0);
    expect(definition.trackingIssue).toBeGreaterThan(0);
    expect(definition.owner.trim().length).toBeGreaterThan(0);
    expect(definition.addedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('only autoTstm is server-backed among v1.7 workstreams', () => {
    for (const feature of V17_WORKSTREAM_KEYS) {
      const definition = getFeatureExposure(feature);
      if (feature === 'autoTstm') {
        expect(definition.serverBacked).toBe(true);
        expect(definition.serverCapabilityKey).toBe('TSTM_GENERATION_ENABLED');
      } else {
        expect(definition.serverBacked).toBe(false);
        expect(definition.serverCapabilityKey).toBeUndefined();
      }
    }
  });
});

/** Exported for policy alignment tests that import the canonical key list. */
export type { V17WorkstreamKey };
